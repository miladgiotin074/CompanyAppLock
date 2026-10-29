import { getSettings, Settings } from '../models/Settings.js';
import { rescheduleWake } from '../services/wakeScheduler.js';
import { sendToTopic } from '../services/fcm.js';
import { requireOwner } from '../middleware/panelAccess.js';

const EDITABLE = [
  'heartbeatMinutes',
  'onlineGraceMultiplier',
  'stabilityNotifDelayMinutes',
];

/** Normalize + validate a server base URL. Returns the clean string or null. */
function cleanServerUrl(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return ''; // explicit clear
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed;
  } catch {
    return null;
  }
}

export default async function settingsRoutes(app) {
  const guard = { preHandler: requireOwner };

  app.get('/settings', guard, async (_req, reply) => {
    const s = await getSettings();
    return reply.send(s.toObject());
  });

  app.put('/settings', guard, async (req, reply) => {
    const body = req.body || {};
    const set = {};
    for (const k of EDITABLE) if (body[k] !== undefined) set[k] = body[k];

    if (set.heartbeatMinutes !== undefined) {
      const m = Number(set.heartbeatMinutes);
      if (!Number.isFinite(m) || m < 1 || m > 1440) {
        return reply.code(400).send({ error: 'heartbeatMinutes must be 1..1440' });
      }
      set.heartbeatMinutes = m;
    }

    const s = await Settings.findByIdAndUpdate('global', { $set: set }, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    });

    if (set.heartbeatMinutes !== undefined) await rescheduleWake();

    return reply.send(s.toObject());
  });

  // GLOBAL monitored (locked) app list — applied to ALL devices. Bumping the
  // version + a topic wake makes every device pull the new list on its next beat.
  app.put('/settings/monitored', guard, async (req, reply) => {
    const packages = Array.isArray(req.body?.packages)
      ? [...new Set(req.body.packages.filter((p) => typeof p === 'string' && p))]
      : [];
    const s = await getSettings();
    s.monitoredPackages = packages;
    s.monitoredVersion = (s.monitoredVersion ?? 1) + 1;
    await s.save();
    sendToTopic({ cmd: 'WAKE', serverUrl: s.serverUrl || '', ts: String(Date.now()) }).catch(() => {});
    return reply.send(s.toObject());
  });

  // Server address for the WHOLE fleet. Saving it pushes the new address to
  // every device over FCM immediately (SET_SERVER broadcast); from then on the
  // address also rides on every wake pulse, so devices that were offline (and
  // brand-new installs with no address at all) adopt it on their next beat.
  app.put('/settings/server-url', guard, async (req, reply) => {
    const url = cleanServerUrl(req.body?.url);
    if (url === null) {
      return reply.code(400).send({ error: 'url must be a valid http(s) URL' });
    }
    const s = await getSettings();
    s.serverUrl = url;
    await s.save();
    const delivered = url
      ? await sendToTopic({ cmd: 'SET_SERVER', serverUrl: url, ts: String(Date.now()) })
      : { ok: true, skipped: true };
    return reply.send({ ...s.toObject(), delivered });
  });
}
