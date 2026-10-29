# CompanyAppLock — Backend

Node.js (Fastify) + MongoDB (Mongoose) + Firebase Admin (FCM). No auth (per project decision §13) — run it behind a private network/VPN.

## Setup

```bash
cd backend
cp .env.example .env            # edit MONGO_URI if needed
# place your Firebase service-account JSON at ./firebase-service-account.json
npm install
npm run dev                     # or: npm start
```

The server boots even without Firebase credentials — FCM calls become no-ops (logged), so you can develop the panel against the API first.

## FCM strategy

- **Topic Messaging** (`all-devices`) — the periodic wake pulse and `/broadcast/wake`. One publish reaches the whole fleet; scales to thousands with no per-device fan-out.
- **Direct token** — targeted commands (`ping`, `lock-list`, `icon`).
- All messages are **data-only, high priority** so the client's handler runs in the background and can revive the lock engine before acting.

## Heartbeat / wake interval

Stored in the `settings` collection, editable from the panel (`PUT /api/v1/settings`), default 5 min. The wake scheduler self-reschedules on change. `online` is derived from `lastSeenAt` at read time (no cron).

## REST API (`/api/v1`)

### Device-side (sent through the client's durable sync engine; honor `Idempotency-Key`)
| Method | Path | Body |
|---|---|---|
| POST | `/devices/register` | `{deviceId, fcmToken, brand, model, androidVersion, sdkInt, appVersion}` |
| POST | `/devices/:id/heartbeat` | `{permissions, lockServiceRunning, lockListVersion, wasForceStopped, fcmToken?}` |
| PUT | `/devices/:id/apps` | `{apps:[{package,label}]}` |
| PUT | `/devices/:id/permissions` | `{permissions:{usage,overlay,battery,notifications,accessibility}}` |
| POST | `/devices/:id/command-result` | `{commandId, ok, detail}` |

### Panel-side
| Method | Path | Notes |
|---|---|---|
| GET | `/devices?online=&q=&page=&limit=` | paginated, indexed |
| GET | `/devices/:id` | one device + installed-apps count |
| GET | `/devices/:id/apps` | installed apps (package + label) |
| POST | `/devices/:id/ping` | liveness probe (token) |
| POST | `/devices/:id/lock-list` | `{packages:[...]}` → bumps version, client pulls |
| POST | `/devices/:id/icon` | `{action: hide\|change\|restore, variant?}` |
| GET/PUT | `/settings` | global settings (heartbeat, grace, notif delay, default lock list) |
| POST | `/broadcast/wake` | manual fleet-wide wake pulse |

`GET /health` → `{ok:true}`.

## Collections
`devices`, `installed_apps`, `commands`, `settings`, `idempotencies` (TTL 24h). Indexes on `deviceId` (unique) and `lastSeenAt` for fast online filtering and listing.

## Scale notes
Stateless API → run several instances behind a load balancer. The wake pulse is a single topic publish, so fleet size doesn't change its cost. Keep `installed_apps` out of the hot `devices` document (already separated).
