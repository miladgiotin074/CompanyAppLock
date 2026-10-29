import { getSettings } from '../models/Settings.js';
import { sendToTopic } from './fcm.js';

/**
 * Periodic wake pulse. Publishes ONE data message to the FCM topic every
 * `heartbeatMinutes` (operator-configurable from the panel). Because it targets
 * a topic, a single publish reaches every device regardless of fleet size — no
 * per-device fan-out, no queue. Self-reschedules so a settings change takes
 * effect on the next tick.
 */
let timer = null;
let logger = null;

async function tick() {
  let minutes = 5;
  try {
    const settings = await getSettings();
    minutes = settings.heartbeatMinutes;
    // Carry the current server address on every pulse: offline/new devices adopt
    // it on their next beat without a separate broadcast, so nothing is hard-coded.
    const res = await sendToTopic({
      cmd: 'WAKE',
      serverUrl: settings.serverUrl || '',
      ts: String(Date.now()),
    });
    logger?.info({ res, intervalMin: minutes }, 'wake pulse published');
  } catch (err) {
    logger?.error({ err: err.message }, 'wake pulse failed');
  } finally {
    scheduleNext(minutes);
  }
}

function scheduleNext(minutes) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(tick, Math.max(1, minutes) * 60 * 1000);
}

export async function startWakeScheduler(log) {
  logger = log;
  const settings = await getSettings();
  scheduleNext(settings.heartbeatMinutes);
  logger?.info(
    { intervalMin: settings.heartbeatMinutes },
    'wake scheduler started',
  );
}

/** Called when the panel changes the interval so it applies promptly. */
export async function rescheduleWake() {
  const settings = await getSettings();
  scheduleNext(settings.heartbeatMinutes);
}

export function stopWakeScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}
