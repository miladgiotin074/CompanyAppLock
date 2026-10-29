import { Port, portDto } from '../models/Port.js';
import { validPort } from '../utils/port.js';
import { installLogText, pinGroupMessage, sendPanelMessage } from './telegramBot.js';

/**
 * One install (or reinstall) line in the port's Telegram group.
 * Online/offline presence is intentionally NOT sent here.
 */
export async function notifyPortInstall(device, { reinstall = false } = {}) {
  const code = device?.port;
  if (!validPort(code)) return { ok: false, skipped: true, reason: 'no-port' };
  const port = await Port.findById(code).lean();
  if (!port?.groupId) return { ok: false, skipped: true, reason: 'unbound' };

  const deviceName = [device.brand, device.model].filter(Boolean).join(' ') || 'نامشخص';
  const deviceId = String(device.deviceId || '');
  const res = await sendPanelMessage(port.groupId, installLogText({
    reinstall,
    portName: port.name || '',
    portCode: code,
    deviceName,
    deviceId,
    android: device.androidVersion || '',
    appVersion: device.appVersion || '',
    label: device.label || '',
  }), {
    label: 'مدیریت کاربر',
    path: `/devices/${encodeURIComponent(deviceId)}`,
    startParam: deviceId,
  });
  if (res.ok && res.result?.message_id) {
    await pinGroupMessage(port.groupId, res.result.message_id);
  }
  return { ...res, port: portDto(port) };
}
