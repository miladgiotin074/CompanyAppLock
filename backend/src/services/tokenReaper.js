import { Device } from '../models/Device.js';
import { getSettings } from '../models/Settings.js';
import { validateTokens } from './fcm.js';

/**
 * Periodically detects uninstalled apps. Android can't tell the server it was
 * removed, but its FCM token goes dead — so we validate tokens with a dryRun
 * send (no actual delivery, devices undisturbed) and flag the dead ones as
 * uninstalled. Runs less often than the heartbeat and batches ≤500 per FCM call,
 * so it scales to thousands with a handful of calls per pass.
 */
let timer = null;
let logger = null;

async function tick() {
  let intervalMin = 15;
  try {
    const settings = await getSettings();
    intervalMin = Math.max(5, settings.heartbeatMinutes * 3);

    const devices = await Device.find(
      { uninstalled: false, fcmToken: { $ne: null } },
      { deviceId: 1, fcmToken: 1 },
    ).lean();

    const byToken = new Map(devices.map((d) => [d.fcmToken, d.deviceId]));
    const tokens = [...byToken.keys()];

    let flagged = 0;
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      const { goneTokens } = await validateTokens(batch);
      if (goneTokens.length) {
        const ids = goneTokens.map((t) => byToken.get(t)).filter(Boolean);
        await Device.updateMany(
          { deviceId: { $in: ids } },
          { $set: { uninstalled: true, uninstalledAt: new Date(), lastInstallNotifiedAt: null } },
        );
        flagged += ids.length;
      }
    }
    if (flagged) logger?.info({ flagged }, 'token reaper: flagged uninstalled');
  } catch (err) {
    logger?.error({ err: err.message }, 'token reaper failed');
  } finally {
    scheduleNext(intervalMin);
  }
}

function scheduleNext(min) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, Math.max(1, min) * 60_000);
}

export async function startTokenReaper(log) {
  logger = log;
  scheduleNext(3); // first pass a few minutes after boot
  logger?.info('token reaper started');
}

export function stopTokenReaper() {
  if (timer) clearTimeout(timer);
  timer = null;
}
