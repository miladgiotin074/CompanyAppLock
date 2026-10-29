# CompanyAppLock — Android client

Kotlin, minSdk 28 (Android 9) → targetSdk 35 (Android 15). **Sideloaded** (no Play, no Android Enterprise). No Material/AppCompat/Compose — framework views only → tiny APK.

> Per project rule #3, this repo is **not built here**. Open it in Android Studio and build it yourself.

## Before building

1. **Firebase:** create a project, add an Android app with applicationId `com.company.applock`, download **`google-services.json`** into `app/`. (Required by the `google-services` plugin / FCM.)
2. **Backend URL:** set `API_BASE` in [`app/build.gradle.kts`](app/build.gradle.kts) (`buildConfigField "API_BASE"`). For the emulator against a local backend use `http://10.0.2.2:3000/api/v1`.
3. JDK 17, Android Studio (Koala+). Open the `android/` folder; let it sync, then Build ▸ Build APK.

## Module map

```
core/        Prefs (state), DeviceInfo (metadata + permission checks), Notifications, Constants, App
onboarding/  OnboardingActivity (permission screen), AutostartHelper (OEM deep-links)
lockengine/  LockService (specialUse FGS), ForegroundAppDetector (UsageStats), LockOverlay, LockController
detect/      AppLockAccessibilityService (optional fallback, off by default)
receivers/   BootReceiver (boot + watchdog alarm), PackageReceiver (updates + app-list refresh)
watchdog/    WatchdogScheduler + WatchdogWorker (recovery), StabilityNotifier (delayed notif)
sync/        Room outbox, ApiClient (OkHttp), SyncEngine (idempotent/collapsing/backoff), SyncWorker, AppsReporter
fcm/         AppFcmService (revive-on-FCM + commands), FcmBootstrap (topic + token)
icon/        IconController (activity-alias hide/change/restore)
```

## Why `specialUse`
The lock engine is a `specialUse` foreground service, **not** `dataSync`: `dataSync`/`mediaProcessing` are capped at 6h/24h and (targeting Android 15) can't start from `BOOT_COMPLETED`. `specialUse` has no cap, no runtime prerequisite, and is not on the boot blocklist. Holding `SYSTEM_ALERT_WINDOW` also exempts us from background-FGS-start limits.

## Stability & recovery (layered)
FGS `START_STICKY` → `BootReceiver` → screen/connectivity callbacks → WorkManager periodic watchdog (~15 min) → `setAndAllowWhileIdle` alarm (re-armed each fire) → FCM wake pulse → `onTaskRemoved`/`onDestroy` self-reschedule. Every check is a cheap "already running? → no-op".

**Lock only when online:** a `NetworkCallback` gates enforcement; offline, detection+overlay pause but the service stays alive. This is also the main battery saver (detection also pauses when the screen is off).

## Commands (FCM, data-only high priority)
`WAKE` (topic, every N min + manual) · `PING` · `LOCK_LIST` (version nudge → client pulls) · `ICON` (hide/change/restore). Every message first **revives the engine** if needed, then acts, then reports a result through the sync queue.

## Known limitations (by design / OS-level)
- **Force-stop / "Restricted" bucket:** nothing (FCM, alarms, jobs, receivers) can restart the app until it's launched manually — an OS guarantee. Mitigate on company devices with battery = *Unrestricted*, autostart enabled, and a no-force-stop policy. Reported to the panel via last-seen.
- **Full icon hide on Android 10+/MIUI is best-effort** and launcher-dependent; icon *change* (alias swap) is reliable.
- **FCM high-priority throttling** is possible; the local watchdog is the independent safety net.
- Registration happens on **first launch** (a sideloaded app can't run on install alone).

## OEM survival checklist
Guide users to enable **Autostart** and set battery to **Unrestricted** per brand (MIUI/HyperOS, EMUI/Huawei, ColorOS/Oppo, Funtouch/Vivo, One UI/Samsung). See `docs/ARCHITECTURE.md` §12 and dontkillmyapp.com; validate on real devices.
