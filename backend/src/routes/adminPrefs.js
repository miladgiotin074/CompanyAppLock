import { AdminPrefs } from '../models/AdminPrefs.js';
import { getAdminId } from '../utils/telegram.js';
import { config } from '../config.js';

const empty = () => ({ customTabs: [], members: {}, pins: {} });

function dto(doc) {
  if (!doc) return empty();
  return {
    customTabs: doc.customTabs || [],
    members: doc.members || {},
    pins: doc.pins || {},
  };
}

export default async function adminPrefsRoutes(app) {
  // This admin's own panel preferences (pins / custom tabs / members).
  app.get('/admin/prefs', async (req, reply) => {
    const adminId = getAdminId(req, config.telegramBotToken);
    if (!adminId) return reply.code(401).send({ error: 'no admin identity' });
    const doc = await AdminPrefs.findById(adminId).lean();
    return reply.send(dto(doc));
  });

  app.put('/admin/prefs', async (req, reply) => {
    const adminId = getAdminId(req, config.telegramBotToken);
    if (!adminId) return reply.code(401).send({ error: 'no admin identity' });
    const b = req.body || {};
    const set = {
      customTabs: Array.isArray(b.customTabs)
        ? b.customTabs
            .filter((t) => t && t.id)
            .map((t) => ({ id: String(t.id), label: String(t.label || '') }))
        : [],
      members: b.members && typeof b.members === 'object' ? b.members : {},
      pins: b.pins && typeof b.pins === 'object' ? b.pins : {},
    };
    const doc = await AdminPrefs.findByIdAndUpdate(
      adminId,
      { $set: set },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean();
    return reply.send(dto(doc));
  });
}
