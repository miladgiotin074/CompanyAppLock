# CompanyAppLock

An in-house, lightweight **enterprise app-lock / device-management** tool for **company-owned Android devices**: when an employee opens a policy-restricted app, a lock screen is shown. Managed from a web panel; server→client over Firebase Cloud Messaging.

> Responsible use: deploy only on company-owned devices, with employees informed that the device is managed (ethical and, in most jurisdictions, a legal requirement). The app collects no personal content — only app-usage-control metadata. See [CLAUDE.md](CLAUDE.md).

## Repository layout

| Folder | What |
|---|---|
| [`android/`](android/) | Kotlin client (minSdk 28 → targetSdk 35). **Not built here** — build in Android Studio (rule #3). |
| [`backend/`](backend/) | Node.js (Fastify) + MongoDB + Firebase Admin. REST API + FCM (topic + token). No auth. |
| [`panel/`](panel/) | React + Vite + Tailwind. Mobile-first, RTL. Tabs: Users + Settings. (Build verified.) |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Full technical design + documented Android facts with citations. |
| [`CLAUDE.md`](CLAUDE.md) | Project rules, requirements, and key decisions. |

## How the pieces connect

```
Android client ──REST (durable, idempotent sync queue)──▶ Backend (Mongo)
       ▲                                                      │
       └────────── FCM: topic (wake-all) + token (commands) ──┘  ◀── React panel (REST)
```

- **Client → server:** register, heartbeat, permissions, installed apps, command results — all through an offline-durable, de-duplicating sync engine.
- **Server → client:** a periodic **FCM topic** wake pulse (interval set in the panel) + targeted token commands (ping, lock-list, icon).
- **Panel:** live online/offline, per-device permissions, installed-app list, lock-list editor, icon control, settings.

## Quick start (recommended order)

1. **Backend** — see [`backend/README.md`](backend/README.md). Needs MongoDB + a Firebase service-account JSON.
2. **Panel** — see [`panel/README.md`](panel/README.md). Point `VITE_API_BASE` at the backend.
3. **Android** — see [`android/README.md`](android/README.md). Add `google-services.json`, set `API_BASE`, build in Android Studio.

## Key design decisions (resolved)
No-auth panel (private network only) · heartbeat interval configurable in the panel · FCM **topic** for broadcast wake + **token** for targeted commands · client **revives the engine on any FCM** · lock engine is a `specialUse` foreground service · per-device lock lists · UsageStats detection with an optional Accessibility fallback. Rationale and the honest limitations (force-stop, best-effort icon hide) are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
