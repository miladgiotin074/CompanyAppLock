# CompanyAppLock — Panel

React + Vite + Tailwind. Mobile-first, RTL (Persian). Bottom navigation with two tabs: **کاربران (Users)** and **تنظیمات (Settings)**.

## Setup

```bash
cd panel
cp .env.example .env     # point VITE_API_BASE at the backend
npm install
npm run dev              # http://localhost:5173
npm run build            # production build → dist/
```

## Screens

- **Users** — searchable, filterable (all/online/offline), auto-refreshing device list with live online dots, permission chips, last-seen and a force-stop warning.
- **Device detail** — device info, permission snapshot, **Ping**, **icon control (hide / change / restore)**, and a **lock-list editor** layered over the installed-app list (package + label only) with per-app toggles.
- **Settings** — editable **heartbeat/wake interval**, online grace multiplier, stability-notification delay, default lock list, and a manual **wake all** (FCM topic) button.

## Notes

- No authentication (per project decision) — serve only behind a private network/VPN.
- Online status is read from the API (derived from `lastSeenAt`); the list polls every `VITE_REFRESH_MS`.
- Scales to thousands of devices via server-side pagination + indexed queries.
