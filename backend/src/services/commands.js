import { Command } from '../models/Command.js';
import { Device } from '../models/Device.js';
import { sendToToken, isTokenGone } from './fcm.js';

/**
 * Issue a targeted command to one device over its FCM token. Keeps payloads
 * tiny: heavy data (e.g. the lock list) is NOT shipped in the push — we send a
 * version nudge and the client pulls the authoritative copy on its next
 * heartbeat. This avoids FCM's ~4KB data limit and keeps one source of truth.
 */
export async function issueCommand(deviceId, type, payload = {}) {
  const device = await Device.findOne({ deviceId });
  if (!device) return { ok: false, code: 404, error: 'unknown device' };

  const cmd = await Command.create({
    deviceId,
    type,
    payload,
    transport: 'token',
    status: 'pending',
  });

  const data = { cmd: type, commandId: String(cmd._id), ...payload };
  const res = await sendToToken(device.fcmToken, data);

  cmd.status = res.ok ? 'sent' : 'failed';
  cmd.sentAt = new Date();
  cmd.error = res.ok ? null : res.error || res.reason || 'send-failed';
  await cmd.save();

  // A dead token means the app was uninstalled / data cleared → flag it.
  if (!res.ok && isTokenGone(res.code)) {
    await Device.updateOne(
      { deviceId },
      { $set: { uninstalled: true, uninstalledAt: new Date(), lastInstallNotifiedAt: null } },
    );
  }

  return { ok: res.ok, code: res.ok ? 200 : 502, command: cmd, fcm: res, device };
}
