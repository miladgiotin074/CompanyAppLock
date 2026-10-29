# Stability & Recovery Review — Android client

Date: 2026-10-25 · Scope: maximum persistence of the lock service + recovery
(reboot, process death, update, Doze, offline→online) across Android 9→15 and
all OEM brands. Verdict: **architecture is sound; two real defects were found and
fixed. The remaining risks are OS-level / operator responsibilities, documented
below.**

---

## 1. Verdict

The persistence design is multi-layered and correct: a `specialUse` foreground
service that never stops, re-asserted by five independent mechanisms. After the
two fixes below, the app is ready for maximum practical stability on
company-owned devices **provided** the operational prerequisites (battery =
Unrestricted, OEM autostart enabled, no manual force-stop) are met — these cannot
be guaranteed from code on non-Enterprise Android and are the only remaining gap.

---

## 2. Defects found and FIXED in this review

### 2.1 Crash on every locked boot (directBoot) — FIXED
`BootReceiver` was `directBootAware="true"` and listened to
`LOCKED_BOOT_COMPLETED`, so it ran **before first unlock**. But `App.onCreate`
and `Prefs` use credential-encrypted storage, which is unavailable before unlock
→ `getSharedPreferences` throws → the process crashes on every locked boot.
The lock is not needed before unlock anyway (locked screen = not interactive =
`shouldEnforce()` is false).
**Fix:** removed `directBootAware` and `LOCKED_BOOT_COMPLETED`; we act on
`BOOT_COMPLETED` (delivered right after unlock). `AndroidManifest.xml`.

### 2.2 Lock never enforced on filtered / VPN networks — FIXED
`isOnlineNow()` / `onCapabilitiesChanged` required `NET_CAPABILITY_VALIDATED`.
The system sets that only after a probe to Google succeeds; on filtered or VPN
networks (common in this deployment region) the probe can fail even when the
device and the company server have real connectivity → `online` stays false →
the lock is never enforced, defeating the core requirement.
**Fix:** enforcement now keys off `NET_CAPABILITY_INTERNET` (connected to a
network that offers internet), not validation. `LockService.kt`.

---

## 3. What is already correct (verified)

**Foreground service** (`LockService.kt`)
- `specialUse` FGS with the required `<property>` and `FOREGROUND_SERVICE_SPECIAL_USE`
  permission — no 6h cap (unlike `dataSync`) and startable from `BOOT_COMPLETED`.
- `startForeground()` is called first thing in `onCreate`/`onStartCommand`, with
  the type param guarded for API ≥ 34.
- `onStartCommand` returns `START_STICKY`; `onTaskRemoved` and `onDestroy` both
  call `scheduleImmediateRestart()`.
- `isRunning` flag reports the *real* state in heartbeats.

**Recovery layers** (all overlap, each covers a different failure):
1. `START_STICKY` — OS re-creates the service after a low-memory kill.
2. `BootReceiver` — restart after reboot (`BOOT_COMPLETED` + QUICKBOOT variants).
3. `PackageReceiver` — restart after app update (`MY_PACKAGE_REPLACED`).
4. WorkManager periodic `WatchdogWorker` (15 min, no network constraint) —
   survives process death and app updates.
5. `AlarmManager.setAndAllowWhileIdle` (15 min, re-armed each fire) — Doze-tolerant
   backup; uses inexact alarm so **no `SCHEDULE_EXACT_ALARM` permission needed**.
6. FCM wake (server, every heartbeat interval) + revive-on-any-FCM.
Every watchdog check is cheap and idempotent ("already running? → no-op").

**Background FGS-start legality (Android 12+)** — the linchpin:
all restart paths (`BootReceiver`, `WatchdogWorker`, FCM, `App.onCreate`) call
`LockService.start` only when `hasCorePermissions()` is true, i.e. **SYSTEM_ALERT_WINDOW
is granted**, which is an explicit exemption from the background-FGS-start
restriction. Boot and high-priority FCM are additional exemptions. So every path
is legal. (If overlay is revoked the app can't function anyway.)

**Internet gating** (`LockController.shouldEnforce = online && screenOn`)
- The FGS **always stays alive** (even offline) so the process survives and can
  re-enforce instantly; only *enforcement* (UsageStats polling + overlay) is
  gated. This exactly matches "lock active only when internet is on, app stays
  alive offline" — and keeping the FGS up is what makes it stable (stopping it
  offline would risk an OS kill and a hard background restart later).
- Detector polls `queryEvents` every 800 ms **only** while online + screen on,
  on a dedicated thread; paused otherwise → minimal CPU/battery.

**Version correctness (9→15):** minSdk 28 / targetSdk 35; `specialUse` is not on
the Android 15 `BOOT_COMPLETED` FGS blocklist; screen/connectivity/user-present
receivers are registered at runtime and listen only to protected system
broadcasts, so they need no `RECEIVER_EXPORTED` flag on Android 14+.

---

## 4. Recovery matrix

| Event | Recovered by | Result |
|---|---|---|
| Low-memory kill | START_STICKY + watchdog | engine back in seconds–minutes |
| Reboot | BootReceiver (after unlock) | engine back on unlock |
| App update | PackageReceiver (MY_PACKAGE_REPLACED) | engine re-asserted |
| Task swiped away | onTaskRemoved → immediate restart | engine back |
| Doze / long idle | AlarmManager AllowWhileIdle + FCM wake | periodic re-assert |
| Offline → online | NetworkCallback → enforcement resumes | lock resumes instantly |
| **Force-stop (manual) / "Restricted" bucket** | **nothing until manual launch** | **unrecoverable (OS guarantee)** |

---

## 5. Residual risks — operator / OS, not code

These cannot be solved in code on non-Enterprise Android:
1. **Manual Force-Stop / Restricted App-Standby bucket** — the OS blocks all
   broadcasts, alarms, jobs and FCM until the user manually opens the app. Only
   mitigations: battery = *Unrestricted*, autostart enabled, and a device policy
   of not force-stopping. The panel surfaces this via last-seen / uninstall flags.
2. **OEM background killers (MIUI/HyperOS, EMUI, ColorOS, Funtouch, …)** — can kill
   WorkManager/alarms unless the app is whitelisted. The onboarding autostart step
   (shown on these brands) + "Unrestricted" battery are the mitigations; must be
   verified per device (DontKillMyApp).
3. **Battery-optimization exemption revoked** by the user → Doze may kill the
   process more aggressively; watchdog + FCM still bring it back when the device
   wakes, but latency grows.

---

## 6. Recommendation

Ship with the two fixes above. On each deployed device, confirm in Settings:
battery = **Unrestricted**, **Autostart ON** (for the listed OEMs), overlay +
usage-access granted, and that the device is never force-stopped. With those,
this is as stable as a sideloaded (non-Device-Owner) app can be on Android 9→15.
