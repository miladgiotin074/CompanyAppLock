# CompanyAppLock — Architecture & Technical Research

Status: **Draft for review** · Target: Android 9 (API 28) → Android 15/16 · All OEM brands
Distribution: **sideloaded** (no Google Play, no Android Enterprise / Device Owner)

This document is the technical ground truth. The final AI build-prompt is generated *from* it.
Every non-obvious Android claim here is backed by a citation in **§12 (Documented facts)**.

---

## 1. System overview

```
┌─────────────────────┐        REST (HTTPS, client→server)        ┌──────────────────────┐
│   Android client     │ ─────────────────────────────────────────▶│   Node.js backend     │
│  (sideloaded APK)    │                                            │   + MongoDB            │
│                      │◀───────────────────────────────────────── │                        │
│  - Lock engine (FGS) │         FCM data messages (server→client)  │   + Firebase Admin SDK │
│  - Sync engine       │                                            └──────────┬────────────┘
│  - Receivers         │                                                       │ REST
└─────────────────────┘                                            ┌──────────▼────────────┐
                                                                     │  React + Tailwind panel│
                                                                     │  (mobile-first)        │
                                                                     └────────────────────────┘
```

Three data paths:
1. **Client → Server (REST):** registration, heartbeat ACK, state/telemetry, installed-app list, permission status, command results. Goes through the **durable sync engine** (never a raw fire-and-forget call).
2. **Server → Client (FCM):** commands (lock-list update, ping, wake, icon control) + the periodic wake pulse. FCM is the only reliable server-initiated channel on Doze-restricted Android.
3. **Panel ↔ Backend (REST):** the operator UI.

Design priority order (from project rules): **Stability & recovery > correctness > low resource use > everything else.** Speed of delivery is explicitly last.

---

## 2. Android client — module map

| Module | Responsibility |
|---|---|
| `onboarding` | One simple screen; request + verify all permissions; brand-specific autostart guidance |
| `lockengine` | `specialUse` foreground service; foreground-app detection; overlay lock screen |
| `receivers` | Boot, connectivity, screen on/off, user-present, package-added, time/locale |
| `sync` | Room-backed outbound queue + WorkManager flush; REST client |
| `fcm` | FCM service; command dispatch; wake handler |
| `watchdog` | Self-healing: AlarmManager + WorkManager re-assert the FGS; delayed stability notification |
| `iconcontrol` | activity-alias enable/disable for hide/change/restore |
| `state` | Single source of truth (DataStore/SharedPreferences); permission + lock-list cache |

No Material Components, no AppCompat-heavy theming, no Jetpack Compose. Plain `android.*` views + a tiny amount of AndroidX core (`core-ktx`, `work-runtime`, `room`, `lifecycle`). This keeps the APK small and startup cheap. (See §9.)

---

## 3. Permissions & onboarding

Requested on a single screen, each with a short rationale and a "verify" state (re-check `onResume`, because all of these are Settings-screen grants, not simple runtime dialogs):

| Permission | API | Why | How to request |
|---|---|---|---|
| `PACKAGE_USAGE_STATS` (Usage Access) | 21+ | Detect which app is in the foreground | `Settings.ACTION_USAGE_ACCESS_SETTINGS`; verify via `AppOpsManager` |
| `SYSTEM_ALERT_WINDOW` (Overlay) | 23+ | Draw the lock screen over other apps; **also exempts us from background-FGS-start limits** | `Settings.ACTION_MANAGE_OVERLAY_PERMISSION`; verify `Settings.canDrawOverlays()` |
| Battery optimization exemption | 23+ | Reduce Doze/standby killing | `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`; verify `isIgnoringBatteryOptimizations()` |
| `POST_NOTIFICATIONS` | 33+ | Show the FGS + stability notification | runtime dialog |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_SPECIAL_USE` | 28+/34+ | Run the lock engine | manifest (normal perms) |
| `RECEIVE_BOOT_COMPLETED` | all | Restart after reboot | manifest |
| `QUERY_ALL_PACKAGES` *(or `<queries>`)* | 30+ | List installed apps | manifest; see §3.1 |
| `INTERNET`, `ACCESS_NETWORK_STATE` | all | Networking + connectivity gating | manifest |
| Brand autostart | — | Survive OEM kills | deep-link to OEM settings + instructions (§7) |

### 3.1 Listing installed apps
`PackageManager.getInstalledPackages()` on API 30+ is filtered by **package visibility**. To get the full list we need either `QUERY_ALL_PACKAGES` (manifest permission; Play restricts it but **we are sideloaded**, so it is available) or a `<queries>` block. We only read **package name + app label** — no icons, no extra metadata — matching the requirement and minimizing cost.

---

## 4. Lock engine (the heart)

### 4.1 Service type: `specialUse` — decided
The always-on service is a **foreground service with `android:foregroundServiceType="specialUse"`**. Rationale, from the docs (§12):
- `dataSync` and `mediaProcessing` are capped at **6 hours / 24h**, then `onTimeout()` fires and the service must stop — unacceptable for an always-on monitor.
- Apps targeting Android 15 **cannot start `dataSync`/`mediaPlayback`/`camera`/`mediaProjection`/`phoneCall` from `BOOT_COMPLETED`** (microphone already blocked from 14). `specialUse` is **not** in that blocklist.
- `specialUse` has **no runtime prerequisite** permission.

Manifest:
```xml
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE"/>
<service
    android:name=".lockengine.LockService"
    android:foregroundServiceType="specialUse"
    android:exported="false">
    <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
        android:value="Enterprise app-usage policy enforcement on company-owned devices"/>
</service>
```
The notification uses a **low-importance channel** with a neutral title (so it's quiet) but is always present while the engine runs — this is mandatory and also a liveness signal.

### 4.2 Foreground-app detection — `UsageStatsManager`, event-based (not polling)
Primary method: `UsageStatsManager.queryEvents()` reading `MOVE_TO_FOREGROUND` / `ACTIVITY_RESUMED` events. **Do not** poll `queryUsageStats` in a tight loop (CPU/battery). Pattern:
- React to triggers, not a fixed timer: on `SCREEN_ON`, `USER_PRESENT`, and a light cadence while the screen is interactive.
- When the screen is **off** or **network is off**, detection is paused entirely (the lock requirement only applies while internet is on — §6 — and nothing can launch while screen is off). This is the single biggest battery saver.
- Keep a short debounce so re-entering the same locked app doesn't re-draw the overlay repeatedly.

`AccessibilityService` is a **documented fallback** (more immediate `TYPE_WINDOW_STATE_CHANGED` events, works where UsageStats is throttled by an OEM) but is heavier, scarier to grant, and more likely to be flagged. Decision: **ship UsageStats as primary; keep an optional Accessibility path behind a flag** for specific OEMs where UsageStats proves unreliable in field testing. Do not enable both detectors at once.

### 4.3 Lock screen overlay
A `WindowManager` overlay view of type `TYPE_APPLICATION_OVERLAY` (API 26+), full-screen, intercepts touches. Shown when a locked package comes to the foreground. It must:
- Re-assert itself if dismissed (e.g. user hits Home — the overlay should block or the engine re-triggers).
- Be a **plain View**, no Material, instant inflate.
- Never leak: one overlay instance, add/remove cleanly on lock/unlock, remove on screen-off.

### 4.4 The lock list
Cached locally (DataStore). Updated by FCM command or pulled on heartbeat. The engine compares the current foreground package against this set. Empty list / unknown state → **fail safe = do not lock** (never trap the device because of a sync gap).

---

## 5. Stability & recovery (project rule #2 — the top priority)

Layered defense. No single mechanism is trusted; they overlap.

1. **FGS + sticky intent:** `START_STICKY`; `startForeground()` immediately in `onStartCommand`. Overlay-permission exemption lets us (re)start it from background/receivers.
2. **BOOT_COMPLETED receiver:** restart engine after reboot. Guarded in try/catch for `ForegroundServiceStartNotAllowedException`; if blocked, enqueue a WorkManager job that starts it when allowed. Note: on Android 12+ the app must not be in the **stopped** state for the broadcast to arrive (§12 force-stop).
3. **Connectivity + screen receivers:** on CONNECTIVITY change, SCREEN_ON, USER_PRESENT → verify the service is alive; if not, restart.
4. **WorkManager periodic watchdog** (~15 min, the platform minimum): idempotent "is the engine running? if not, start it." Survives process death and app updates.
5. **AlarmManager** (`setExactAndAllowWhileIdle` or inexact for battery) as a secondary heartbeat to re-assert the FGS during long idle windows.
6. **FCM wake pulse** (§8): server-side every ~5 min, re-asserts the engine for devices that slipped through.
7. **Self-restart on task removal:** handle `onTaskRemoved` to reschedule.

**Explicitly out of scope / impossible (documented, not hidden):**
- **Manual Force-Stop** (Settings → Force stop) or **"Restricted" App-Standby bucket** → the OS blocks all broadcasts, alarms, jobs, and FCM until the user manually launches the app again. **No app can escape this** (since Android 3.1). Mitigations for company devices: battery = *Unrestricted*, autostart enabled, and an operational policy of not force-stopping. This limitation is surfaced to the panel so an operator sees "went silent after force-stop."

Recovery must be **cheap**: every watchdog check is a quick "already running? → do nothing." No busy loops, no wakelocks held longer than a few ms.

---

## 6. Internet-gating of the lock

Requirement: the lock service should **only enforce while internet is ON**; with internet off, locked apps are harmless so no lock — **but the app itself stays alive and ready.**

Implementation:
- A `ConnectivityManager.NetworkCallback` tracks real connectivity (validated capability, not just "connected").
- `online == true` → detection + overlay active. `online == false` → detection paused, overlay removed, **engine keeps running** (just idle/cheap). This is also the main power optimization.
- On transition offline→online, immediately flush the sync queue (§7) and re-pull the lock list in case it changed while offline.

---

## 7. Sync engine (durable, dynamic, no dupes)

Client→server reliability layer. **Every** outbound call goes through this; nothing calls REST directly.

### 7.1 Storage — Room
`outbox` table:
| col | purpose |
|---|---|
| `id` (uuid) | client-generated; **used as idempotency key** (sent as `Idempotency-Key` header) |
| `type` | REGISTER / HEARTBEAT / STATE / APP_LIST / PERMISSIONS / CMD_RESULT |
| `payload` | JSON |
| `created_at` | ordering |
| `attempts`, `next_attempt_at` | backoff bookkeeping |
| `status` | PENDING / INFLIGHT / DONE |
| `dedupe_key` | collapses redundant rows (see below) |

### 7.2 No duplicates, no partial requests
- **Idempotency key per request** → server dedupes; a retry after an uncertain network failure can't double-apply.
- **Dedupe/collapse:** state-like messages (HEARTBEAT, PERMISSIONS, APP_LIST, STATE) are *last-writer-wins*: a new row with the same `dedupe_key` replaces the pending older one, so a backlog after long offline doesn't flood the server with stale snapshots. Event-like messages (CMD_RESULT) are never collapsed.
- **Atomic enqueue-then-send:** write to Room first, then attempt send; mark DONE only on a confirmed 2xx. A crash mid-flight leaves it PENDING → resent. This guarantees *at-least-once* delivery + server idempotency = *effectively-once*.

### 7.3 Retry & flush
- **WorkManager** job with `NetworkType.CONNECTED` constraint flushes the outbox. Exponential backoff (e.g. 5s → cap ~30 min) with jitter to avoid thundering-herd across thousands of devices.
- Immediate flush also triggered on: connectivity-regained, successful FCM wake, app foreground.
- Requests are **small and batched** where possible (one round-trip carrying several queued items) to minimize data/radio usage.

### 7.4 Resource budget
- No persistent socket; REST only, coalesced.
- Gzip request/response. Tiny JSON. HTTP keep-alive via a single shared OkHttp client.
- Timeouts tuned for weak networks; failures are normal, not errors — they just leave the row PENDING.

---

## 8. Server→client: FCM + the 5-minute wake pulse

- App registers its **FCM token** on first launch (part of REGISTER) and refreshes on rotation.
- **Commands** (lock-list change, ping, icon control, wake) are **high-priority FCM data messages** → delivered even in Doze, granting a brief network + wakelock window (§12). On receipt the app: re-asserts the FGS, applies the command, and enqueues a result/ACK.
- **Ping** → app replies with a fresh heartbeat; panel marks online (§10).
- **Periodic wake (~5 min):** backend fans out a lightweight high-priority data message to all active devices (topic or token-batch, see §11.4). This is the "wake sleeping apps" mechanism. Honest caveats documented in §9: FCM high-priority has anti-abuse throttling, and force-stopped/restricted apps won't receive it.

---

## 9. Known limitations (surfaced, never hidden)

1. **Force-stop / Restricted bucket** — unrecoverable until manual launch (§5). Panel shows last-seen so operators can spot it.
2. **Full icon hide on Android 10+ / MIUI is best-effort.** `setComponentEnabledSetting(DISABLED)` on an activity-alias removes the icon on many launchers, but some OEM launchers/versions keep a placeholder, and timing is async. **Icon *change* (swap via multiple aliases) is reliable; full *hide* is not guaranteed** — documented so expectations are set. Keep the `DEFAULT` category so receivers keep working if the `LAUNCHER` category is dropped.
3. **FCM high-priority throttling** — Google may throttle apps that send high-priority messages without producing user-facing notifications. The 5-min pulse should be as light as possible; the WorkManager/AlarmManager watchdogs are the local safety net that doesn't depend on FCM.
4. **No-auth panel** — any device/network that reaches the backend can issue commands to all devices. Strong recommendation: at minimum bind the backend to a private network/VPN and add a shared secret header, even if a full login UI is skipped. (Decision deferred to operator; risk recorded.)
5. **OEM variance** — autostart/kill behavior differs per brand and changes across OS updates; must be validated on real devices (§7 OEM list).

---

## 10. Online/offline detection (panel side)

- Each heartbeat / ping-reply updates `lastSeenAt` on the device document.
- A device is **online** if `now - lastSeenAt < threshold` (e.g. 2× the heartbeat interval + grace). Computed at read-time; no cron needed to flip状态, but an indexed field allows fast filtering.
- Panel can issue an **on-demand ping** (FCM) and watch for the ACK to confirm liveness in real time.

---

## 11. Backend (Node.js + MongoDB) + scale to thousands

### 11.1 Stack
Node (Express or Fastify — Fastify preferred for throughput), MongoDB (Mongoose or native driver), Firebase Admin SDK for FCM, no auth per requirement (see §9.4 risk note).

### 11.2 Collections
- `devices`: `_id`, `deviceId`, `fcmToken`, `model`, `brand`, `androidVersion`, `appVersion`, `lastSeenAt`, `online`(derived), `permissions{usage,overlay,battery,notifications}`, `iconState`, `lockListVersion`, `installedAppsRef`, `createdAt`.
- `installed_apps`: `deviceId`, `[{package,label}]`, `updatedAt` (separate collection; lists can be large).
- `commands`: `deviceId`, `type`, `payload`, `status`, `idempotencyKey`, `createdAt`, `deliveredAt`, `result`.
- `settings`: global config (heartbeat interval, default lock list, etc.).
- `idempotency`: `key` (unique index, TTL) → dedupes client retries.

### 11.3 Endpoints (REST)
```
POST /api/v1/devices/register        {deviceId, fcmToken, model, brand, osVer, appVer}
POST /api/v1/devices/:id/heartbeat    {permissions, online metrics}   (Idempotency-Key)
PUT  /api/v1/devices/:id/apps         {apps:[{package,label}]}
PUT  /api/v1/devices/:id/permissions  {usage,overlay,battery,notifications}
POST /api/v1/devices/:id/command-result {commandId, ok, detail}
--- panel ---
GET  /api/v1/devices?online=&q=&page= (paginated, indexed)
GET  /api/v1/devices/:id
POST /api/v1/devices/:id/ping
POST /api/v1/devices/:id/lock-list    {packages:[...]}
POST /api/v1/devices/:id/icon         {action: hide|change|restore, variant?}
POST /api/v1/broadcast/wake           (the 5-min pulse; also schedulable)
GET/PUT /api/v1/settings
```
All write endpoints honor `Idempotency-Key`. All list endpoints are **paginated + indexed** (`lastSeenAt`, `brand`, `deviceId`).

### 11.4 Scale
- Stateless API nodes behind a load balancer; horizontal scale.
- The 5-min wake pulse uses **FCM topic messaging** (subscribe all devices to a topic → one publish) or batched `sendEach` (≤500/req) via a queue (BullMQ/Redis) so a single tick doesn't block the event loop — fan-out to thousands is a background job, not a request handler.
- Mongo indexes on every query path; `installed_apps` kept out of the hot `devices` doc.
- Derive `online` at query time from `lastSeenAt` (indexed range) to avoid a cron rewriting thousands of docs every interval.

---

## 12. Documented facts (citations)

- **FGS types, permissions, exceptions, specialUse `<property>`** — Android Developers, *Foreground service types are required (Android 14)*: https://developer.android.com/about/versions/14/changes/fgs-types-required
- **`dataSync`/`mediaProcessing` 6h/24h cap + `onTimeout`; BOOT_COMPLETED blocklist (camera, dataSync, mediaPlayback, mediaProjection, phoneCall; microphone from 14)** — Android Developers, *Changes to foreground service types (Android 15)*: https://developer.android.com/about/versions/15/changes/foreground-service-types and behavior-changes-15 §fgs-boot-completed.
- **Stopped state cancels pending intents; BOOT_COMPLETED only after leaving stopped; `ApplicationStartInfo.wasForceStopped()`** — Android Developers, *Behavior changes: all apps (Android 15)*: https://developer.android.com/about/versions/15/behavior-changes-all
- **FCM optimized for Doze; high-priority for time-sensitive delivery in Doze; normal priority deferred to maintenance windows; exemptions last resort** — Android Developers, *Optimize for Doze and App Standby*: https://developer.android.com/training/monitoring-device-state/doze-standby
- **ForegroundServiceStartNotAllowedException + defensive BOOT start pattern; overlay/battery-exemption as background-start exemptions** — Android Developers, *Foreground services overview* + *Restrictions on starting a foreground service from the background*.
- **OEM autostart/kill behavior (MIUI/HyperOS, EMUI/Huawei, ColorOS/Oppo, Funtouch/Vivo), "Unrestricted" battery + per-OEM autostart as the cross-brand fix** — DontKillMyApp: https://dontkillmyapp.com (per-brand pages are authoritative; validate on real devices).
- **Hiding launcher icon via `setComponentEnabledSetting` on an activity-alias is async/device-dependent; keep `DEFAULT` category for receivers** — community-documented; treat full-hide as best-effort on Android 10+/MIUI.

### OEM survival checklist (validate per device)
| Brand / skin | Key setting to guide the user to |
|---|---|
| Xiaomi (MIUI/HyperOS) | Security → Autostart ON; Battery saver → No restrictions; "Background autostart" permission |
| Huawei (EMUI/HarmonyOS) | App launch → Manage manually → all ON; Protected apps |
| Oppo/Realme (ColorOS) | Battery → allow background; disable "sleep"/auto-optimize for the app |
| Vivo (Funtouch/OriginOS) | Autostart ON; high background power consumption allow |
| Samsung (One UI) | Battery → Unrestricted; remove from "sleeping apps"/"deep sleep" |
| Stock/Pixel | Battery → Unrestricted; the battery-optimization exemption covers most |

---

## 13. Decisions — RESOLVED (operator-confirmed 2026-10-21)
1. **Panel security:** **No auth, no shared secret** for now (operator accepts the risk recorded in §9.4). Build accordingly; keep a single choke-point middleware so a secret can be switched on later with one change.
2. **Heartbeat interval:** **Configurable from the panel Settings page**, default **5 min**; stored in the `settings` collection and read by the wake scheduler and the online-threshold logic.
3. **Device identity:** **`Settings.Secure.ANDROID_ID`** (stable per signing key across uninstall/reinstall and data-clear). A reinstall therefore hits the **same** device row — not a new user — and `register` clears the `uninstalled` flag.
4. **Lock list:** **GLOBAL "monitored" list** in Settings, applied to ALL devices (operator changed this from per-device). Toggling an app in any device's app page updates the global list; a `monitoredVersion` bump + topic wake makes every client pull it. (Heartbeat still uses the wire field name `lockListVersion`/`lockList` for client compatibility, now carrying the global version/list.)
5. **Foreground-app detection:** **UsageStats only** (no Accessibility service — removed at the operator's request).
8. **Uninstall detection:** Android can't notify the server on uninstall, so the backend flags `uninstalled` when the device's FCM token is unregistered — detected both during real commands and by a periodic `dryRun` token-validation reaper (devices undisturbed). Shown in the panel; cleared on re-register.
6. **FCM strategy:** **Topic Messaging** (`all-devices` topic) for the periodic wake pulse / broadcasts; **direct token** for targeted commands (ping, lock-list, icon).
7. **Revive-on-FCM:** the FCM `onMessageReceived` handler **always** verifies the lock engine is alive and (re)starts it when possible *before* dispatching the command.

Implementation note: these are built directly into this repository (`backend/`, `panel/`, `android/`) — not emitted as a separate AI prompt.
