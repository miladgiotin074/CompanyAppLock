import { Command } from '../models/Command.js';
import { getSettings } from '../models/Settings.js';
import { sendToTopic } from '../services/fcm.js';
import { requireOwner } from '../middleware/panelAccess.js';

export default async function broadcastRoutes(app) {
  // Manual fleet-wide wake pulse (the scheduler does this automatically; this
  // lets an operator trigger one on demand). One topic publish → all devices.
  app.post('/broadcast/wake', { preHandler: requireOwner }, async (_req, reply) => {
    const settings = await getSettings();
    const cmd = await Command.create({
      deviceId: '*all*',
      type: 'WAKE',
      transport: 'topic',
      status: 'pending',
    });
    const res = await sendToTopic({
      cmd: 'WAKE',
      commandId: String(cmd._id),
      serverUrl: settings.serverUrl || '',
      ts: String(Date.now()),
    });
    cmd.status = res.ok ? 'sent' : 'failed';
    cmd.sentAt = new Date();
    cmd.error = res.ok ? null : res.error || res.reason || 'send-failed';
    await cmd.save();
    return reply.send({ ok: res.ok, delivered: res });
  });
}
