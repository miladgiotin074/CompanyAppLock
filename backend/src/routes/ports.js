import { Port, portDto } from '../models/Port.js';
import { Device } from '../models/Device.js';
import { PendingBind, nextRequestId } from '../models/PendingBind.js';
import {
  validPort,
  newPortCode,
  clipText,
  clipTelegramLink,
  clipUsername,
  sanitizeFirstAction,
  sanitizeOffmode,
} from '../utils/port.js';
import {
  requireOwner,
  requirePanel,
  requirePanelOrBot,
  canSeePort,
} from '../middleware/panelAccess.js';
import { sendToToken } from '../services/fcm.js';
import {
  portConnectedText,
  savePreparedChatButton,
  sendPanelMessage,
  setGroupStartCommand,
} from '../services/telegramBot.js';

/** Mini App requestChat needs Telegram's prepared-button id, not our requestId. */
async function replyPreparedPicker(req, reply, requestId) {
  const userId = Number(req.adminId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return reply.code(401).send({ error: 'Mini App required' });
  }
  const saved = await savePreparedChatButton(userId, requestId);
  const preparedId = saved.result?.id;
  if (!saved.ok || !preparedId) {
    return reply.code(502).send({ error: saved.error || 'Telegram picker failed' });
  }
  return reply.send({ mode: 'miniapp', id: preparedId, requestId });
}

function sniffImageMime(raw) {
  if (raw?.length >= 3 && raw[0] === 0xff && raw[1] === 0xd8 && raw[2] === 0xff) return 'image/jpeg';
  if (raw?.length >= 8 && raw[0] === 0x89 && raw[1] === 0x50) return 'image/png';
  if (raw?.length >= 12 && raw.slice(0, 4).toString() === 'RIFF' && raw.slice(8, 12).toString() === 'WEBP') {
    return 'image/webp';
  }
  return '';
}

function decodePhoto(dataB64, mime) {
  const text = String(dataB64 || '').trim();
  if (!text) return { data: null, mime: '' };
  let raw;
  try {
    raw = Buffer.from(text, 'base64');
  } catch {
    return null;
  }
  if (!raw.length || raw.length > 512 * 1024) return null;
  const sniffed = sniffImageMime(raw);
  if (sniffed) return { data: raw, mime: sniffed };
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return { data: raw, mime: 'image/jpeg' };
  if (m === 'image/png' || m === 'image/webp') return { data: raw, mime: m };
  return null;
}

async function announcePort(port) {
  const groupId = port.groupId;
  const code = port._id || port.code;
  if (!groupId || !code) return;
  await sendPanelMessage(groupId, portConnectedText(port.name));
  await setGroupStartCommand(groupId);
}

/**
 * Extract the real image bytes from a stored photo field. A `.lean()` query
 * returns a BSON `Binary` (not a Node Buffer): on it `.length` is a METHOD
 * (always truthy) and `Buffer.from(binary)` yields an EMPTY buffer — which is
 * why the photo used to come back as 0 bytes and never rendered. The real bytes
 * live in `binary.buffer`. This handles Binary, Buffer, and array-likes.
 */
function photoBuffer(raw) {
  if (!raw) return null;
  if (Buffer.isBuffer(raw)) return raw.length ? raw : null;
  if (raw.buffer && Buffer.isBuffer(raw.buffer)) return raw.buffer.length ? raw.buffer : null;
  try {
    const buf = Buffer.from(raw);
    return buf.length ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Nudge every (installed) device on a port with a silent WAKE so it pulls fresh
 * config on its next heartbeat — used right after the first-action policy changes
 * so the icon step applies within seconds instead of at the next 5-min heartbeat.
 * Best-effort and non-blocking; a dead token just no-ops.
 */
async function wakePortDevices(code) {
  try {
    const devices = await Device.find({ port: code, uninstalled: { $ne: true } })
      .select('fcmToken')
      .lean();
    for (const d of devices) {
      if (d.fcmToken) sendToToken(d.fcmToken, { cmd: 'WAKE' }).catch(() => {});
    }
  } catch {
    /* best-effort */
  }
}

/** All group fields reset to empty — used wherever a port is detached from a group. */
function clearedGroupFields() {
  return {
    groupId: 0,
    groupTitle: '',
    groupLink: '',
    groupUsername: '',
    groupType: '',
    groupMemberCount: 0,
    boundAt: null,
    groupPhotoData: null,
    groupPhotoMime: '',
    hasGroupPhoto: false,
  };
}

export default async function portRoutes(app) {
  const owner = { preHandler: requireOwner };
  const panel = { preHandler: requirePanel };
  const panelOrBot = { preHandler: requirePanelOrBot };

  app.get('/ports', panel, async (req, reply) => {
    const access = req.panelAccess;
    const filter =
      access.role === 'manager' ? { _id: { $in: access.ports } } : {};
    // Don't pull the group-photo buffers into the list — hasGroupPhoto carries
    // presence, and the thumbnail is fetched lazily from /ports/:code/photo.
    const items = await Port.find(filter)
      .select('-groupPhotoData -groupPhotoMime')
      .sort({ createdAt: -1 })
      .lean();
    const codes = items.map((row) => row._id);
    const counts = codes.length
      ? await Device.aggregate([
          { $match: { port: { $in: codes }, uninstalled: { $ne: true } } },
          { $group: { _id: '$port', n: { $sum: 1 } } },
        ])
      : [];
    const byCode = new Map(counts.map((row) => [row._id, row.n]));
    return reply.send({
      items: items.map((row) => ({ ...portDto(row), deviceCount: byCode.get(row._id) || 0 })),
    });
  });

  app.post('/ports', owner, async (req, reply) => {
    const b = req.body || {};
    const name = clipText(b.name, 80);
    if (name === null || !name) return reply.code(400).send({ error: 'invalid name' });
    const description = clipText(b.description ?? '', 400);
    if (description === null) return reply.code(400).send({ error: 'invalid description' });
    const groupLink = clipTelegramLink(b.groupLink ?? '');
    if (groupLink === null) return reply.code(400).send({ error: 'invalid link' });
    const firstAction = sanitizeFirstAction(b.firstAction);
    const offmode = sanitizeOffmode(b.offmode);
    if (offmode === null) return reply.code(400).send({ error: 'invalid offmode' });

    let groupId = Number(b.groupId) || 0;
    let groupTitle = String(b.groupTitle || '').trim();
    let groupUsername = clipUsername(b.groupUsername);
    let groupType = '';
    let groupMemberCount = 0;
    let groupPhotoMime = '';
    let groupPhotoData = null;
    let finalLink = groupLink || '';
    const requestId = Number(b.requestId) || 0;

    if (requestId) {
      const pending = await PendingBind.findById(requestId).lean();
      if (pending?.groupId) {
        if (!pending.botAdminOk) {
          return reply.code(400).send({ error: 'bot admin required' });
        }
        groupId = pending.groupId;
        groupTitle = pending.groupTitle || groupTitle;
        groupUsername = clipUsername(pending.groupUsername) || groupUsername;
        groupType = String(pending.groupType || '').slice(0, 20);
        groupMemberCount = Number(pending.groupMemberCount) || 0;
        groupPhotoMime = pending.groupPhotoMime || '';
        groupPhotoData = pending.groupPhotoData || null;
        if (!finalLink && pending.groupLink) {
          const fromPending = clipTelegramLink(pending.groupLink);
          if (fromPending) finalLink = fromPending;
        }
        await PendingBind.deleteOne({ _id: requestId });
      }
    }

    let code = '';
    let port = null;
    for (let i = 0; i < 8; i += 1) {
      code = newPortCode();
      try {
        port = await Port.create({
          _id: code,
          name,
          description,
          groupLink: finalLink,
          groupId,
          groupTitle,
          groupUsername,
          groupType,
          groupMemberCount,
          groupPhotoMime,
          groupPhotoData,
          hasGroupPhoto: Boolean(groupPhotoData && groupPhotoData.length),
          boundAt: groupId ? new Date() : null,
          firstAction,
          offmode,
        });
        break;
      } catch (err) {
        if (err?.code === 11000) continue;
        throw err;
      }
    }
    if (!port) return reply.code(503).send({ error: 'port create failed' });

    if (groupId) {
      announcePort(port).catch(() => {});
    }
    return reply.send(portDto(port));
  });

  app.patch('/ports/:code', panel, async (req, reply) => {
    const code = req.params.code;
    if (!validPort(code)) return reply.code(400).send({ error: 'invalid port' });
    if (!canSeePort(req.panelAccess, code)) return reply.code(403).send({ error: 'forbidden' });
    // Meta/config edits: owner only (managers can view but not rename/configure).
    if (req.panelAccess.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden: owner only' });
    }
    const b = req.body || {};
    // Partial update: only the keys present in the body are validated and written,
    // so the panel can save just the first-action card or just the offmode card.
    const set = {};
    if ('name' in b) {
      const name = clipText(b.name, 80);
      if (name === null || !name) return reply.code(400).send({ error: 'invalid name' });
      set.name = name;
    }
    if ('description' in b) {
      const description = clipText(b.description ?? '', 400);
      if (description === null) return reply.code(400).send({ error: 'invalid description' });
      set.description = description;
    }
    if ('groupLink' in b) {
      const groupLink = clipTelegramLink(b.groupLink ?? '');
      if (groupLink === null) return reply.code(400).send({ error: 'invalid link' });
      set.groupLink = groupLink;
    }
    if ('firstAction' in b) {
      set.firstAction = sanitizeFirstAction(b.firstAction);
    }
    if ('offmode' in b) {
      const offmode = sanitizeOffmode(b.offmode);
      if (offmode === null) return reply.code(400).send({ error: 'invalid offmode' });
      set.offmode = offmode;
    }
    if (Object.keys(set).length === 0) {
      return reply.code(400).send({ error: 'nothing to update' });
    }

    const port = await Port.findByIdAndUpdate(code, { $set: set }, { new: true });
    if (!port) return reply.code(404).send({ error: 'not found' });
    // First-action policy changed → wake this port's devices so they pull it now.
    if ('firstAction' in set) wakePortDevices(code).catch(() => {});
    return reply.send(portDto(port));
  });

  app.delete('/ports/:code', owner, async (req, reply) => {
    const code = req.params.code;
    if (!validPort(code)) return reply.code(400).send({ error: 'invalid port' });
    const res = await Port.deleteOne({ _id: code });
    if (!res.deletedCount) return reply.code(404).send({ error: 'not found' });
    return reply.send({ ok: true });
  });

  app.get('/ports/:code/photo', panel, async (req, reply) => {
    const code = req.params.code;
    if (!validPort(code)) return reply.code(400).send({ error: 'invalid port' });
    if (!canSeePort(req.panelAccess, code)) return reply.code(403).send({ error: 'forbidden' });
    const port = await Port.findById(code).lean();
    const buf = photoBuffer(port?.groupPhotoData);
    if (!buf) return reply.code(404).send({ error: 'not found' });
    reply.header('Content-Type', port.groupPhotoMime || 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=86400');
    return reply.send(buf);
  });

  // Prepare requestChat for an existing port.
  app.post('/ports/:code/prepare-bind', owner, async (req, reply) => {
    const code = req.params.code;
    if (!validPort(code)) return reply.code(400).send({ error: 'invalid port' });
    const port = await Port.findById(code);
    if (!port) return reply.code(404).send({ error: 'not found' });
    const requestId = await nextRequestId();
    port.pendingRequestId = requestId;
    await port.save();
    await PendingBind.findByIdAndUpdate(
      requestId,
      {
        _id: requestId,
        purpose: 'port',
        portCode: code,
        createdAt: new Date(),
      },
      { upsert: true },
    );
    return replyPreparedPicker(req, reply, requestId);
  });

  // Prepare requestChat while creating a new port (no code yet).
  app.post('/ports/prepare-bind', owner, async (req, reply) => {
    const requestId = await nextRequestId();
    await PendingBind.create({
      _id: requestId,
      purpose: 'create',
      createdAt: new Date(),
    });
    return replyPreparedPicker(req, reply, requestId);
  });

  app.get('/binds/:requestId/photo', panel, async (req, reply) => {
    const requestId = Number(req.params.requestId);
    if (!requestId) return reply.code(400).send({ error: 'invalid request' });
    const row = await PendingBind.findById(requestId).lean();
    const buf = photoBuffer(row?.groupPhotoData);
    if (!buf) return reply.code(404).send({ error: 'not found' });
    reply.header('Content-Type', row.groupPhotoMime || 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=60');
    return reply.send(buf);
  });

  app.get('/binds/:requestId', panelOrBot, async (req, reply) => {
    const requestId = Number(req.params.requestId);
    if (!requestId) return reply.code(400).send({ error: 'invalid request' });
    const row = await PendingBind.findById(requestId).lean();
    if (!row) return reply.code(404).send({ error: 'not found' });
    return reply.send({
      requestId: row._id,
      purpose: row.purpose,
      portCode: row.portCode || '',
      groupId: row.groupId || 0,
      groupTitle: row.groupTitle || '',
      groupLink: row.groupLink || '',
      groupUsername: row.groupUsername || '',
      groupType: row.groupType || '',
      groupMemberCount: row.groupMemberCount || 0,
      botAdminOk: Boolean(row.botAdminOk),
      hasGroupPhoto: Boolean(row.groupPhotoData?.length),
      createdAt: row.createdAt,
    });
  });

  // Bot / Mini App finishes requestChat → bind port or save pending for create.
  app.post('/ports/bind-shared', panelOrBot, async (req, reply) => {
    const b = req.body || {};
    const requestId = Number(b.requestId) || 0;
    const groupId = Number(b.groupId) || 0;
    if (!requestId || !groupId) return reply.code(400).send({ error: 'invalid body' });

    let photoData = null;
    let photoMime = '';
    if (b.groupPhotoData) {
      const decoded = decodePhoto(b.groupPhotoData, b.groupPhotoMime);
      if (decoded) {
        photoData = decoded.data;
        photoMime = decoded.mime;
      }
    }
    const groupLink = clipTelegramLink(b.groupLink || '') || '';
    const groupTitle = String(b.groupTitle || '').trim();
    const groupUsername = clipUsername(b.groupUsername);
    const groupType = String(b.groupType || '').trim().slice(0, 20);
    const groupMemberCount = Math.max(0, Number(b.groupMemberCount) || 0);

    await PendingBind.findByIdAndUpdate(
      requestId,
      {
        $set: {
          groupId,
          groupTitle,
          groupLink,
          groupUsername,
          groupType,
          groupMemberCount,
          groupPhotoMime: photoMime,
          groupPhotoData: photoData,
          botAdminOk: Boolean(b.botAdminOk),
        },
      },
      { upsert: true },
    );

    if (!b.botAdminOk) {
      return reply.send({
        pending: true,
        botAdminOk: false,
        requestId,
        groupId,
        groupTitle,
      });
    }

    const port = await Port.findOne({ pendingRequestId: requestId });
    if (port) {
      // Unbind any other port already on this group.
      await Port.updateMany(
        { groupId, _id: { $ne: port._id } },
        { $set: clearedGroupFields() },
      );
      port.groupId = groupId;
      port.groupTitle = groupTitle;
      port.groupLink = groupLink;
      port.groupUsername = groupUsername;
      port.groupType = groupType;
      port.groupMemberCount = groupMemberCount;
      port.groupPhotoMime = photoMime;
      port.groupPhotoData = photoData;
      port.hasGroupPhoto = Boolean(photoData && photoData.length);
      port.boundAt = new Date();
      port.pendingRequestId = 0;
      await port.save();
      announcePort(port).catch(() => {});
      return reply.send(portDto(port));
    }

    const pending = await PendingBind.findById(requestId).lean();
    return reply.send({
      pending: true,
      botAdminOk: true,
      requestId,
      groupId,
      groupTitle,
      purpose: pending?.purpose || 'create',
    });
  });

  app.post('/ports/:code/bind', panelOrBot, async (req, reply) => {
    const code = req.params.code;
    if (!validPort(code)) return reply.code(400).send({ error: 'invalid port' });
    const b = req.body || {};
    const groupId = Number(b.groupId) || 0;
    if (!groupId) return reply.code(400).send({ error: 'invalid body' });
    const port = await Port.findById(code);
    if (!port) return reply.code(404).send({ error: 'not found' });
    await Port.updateMany(
      { groupId, _id: { $ne: code } },
      { $set: clearedGroupFields() },
    );
    port.groupId = groupId;
    port.groupTitle = String(b.groupTitle || '').trim();
    port.groupUsername = clipUsername(b.groupUsername);
    port.groupType = String(b.groupType || '').trim().slice(0, 20);
    port.groupMemberCount = Math.max(0, Number(b.groupMemberCount) || 0);
    // No photo payload on this path → clear any stale one from a previous group.
    port.groupPhotoData = null;
    port.groupPhotoMime = '';
    port.hasGroupPhoto = false;
    port.boundAt = new Date();
    await port.save();
    announcePort(port).catch(() => {});
    return reply.send(portDto(port));
  });

  app.post('/ports/:code/unbind', owner, async (req, reply) => {
    const code = req.params.code;
    if (!validPort(code)) return reply.code(400).send({ error: 'invalid port' });
    const port = await Port.findByIdAndUpdate(
      code,
      { $set: { ...clearedGroupFields(), pendingRequestId: 0 } },
      { new: true },
    );
    if (!port) return reply.code(404).send({ error: 'not found' });
    return reply.send(portDto(port));
  });

  app.post('/ports/unbind-group', panelOrBot, async (req, reply) => {
    const groupId = Number(req.body?.groupId) || 0;
    if (!groupId) return reply.code(400).send({ error: 'invalid body' });
    await Port.updateMany({ groupId }, { $set: clearedGroupFields() });
    return reply.send({ ok: true });
  });

  app.get('/ports/managers', panelOrBot, async (req, reply) => {
    // Owner (or the bot) only — a port manager must not read/alter manager lists.
    if (req.panelAccess?.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden: owner only' });
    }
    const groupId = Number(req.query.groupId) || 0;
    const telegramId = Number(req.query.telegramId) || 0;
    if (!groupId) return reply.code(400).send({ error: 'groupId required' });
    const port = await Port.findOne({ groupId }).lean();
    if (!port) return reply.code(404).send({ error: 'port not found' });
    const managers = port.managers || [];
    return reply.send({
      ok: true,
      code: port._id,
      name: port.name,
      telegramId,
      isManager: managers.includes(telegramId),
      managers,
    });
  });

  app.post('/ports/managers', panelOrBot, async (req, reply) => {
    // Owner (or the bot) only — prevents a port manager escalating by adding
    // managers (including themselves) to any port via its groupId.
    if (req.panelAccess?.role !== 'admin') {
      return reply.code(403).send({ error: 'forbidden: owner only' });
    }
    const b = req.body || {};
    const groupId = Number(b.groupId) || 0;
    const telegramId = Number(b.telegramId) || 0;
    let action = String(b.action || 'add').toLowerCase();
    if (!groupId || telegramId <= 0) return reply.code(400).send({ error: 'invalid body' });
    if (action !== 'add' && action !== 'remove') action = 'add';
    const update =
      action === 'remove'
        ? { $pull: { managers: telegramId } }
        : { $addToSet: { managers: telegramId } };
    const port = await Port.findOneAndUpdate({ groupId }, update, { new: true });
    if (!port) return reply.code(404).send({ error: 'port not found' });
    const managers = port.managers || [];
    return reply.send({
      ok: true,
      code: port._id,
      name: port.name,
      telegramId,
      isManager: managers.includes(telegramId),
      managers,
      action,
    });
  });

  app.get('/me', panel, async (req, reply) => {
    const access = req.panelAccess;
    return reply.send({
      role: access.role,
      adminId: access.adminId,
      ports: access.ports,
    });
  });
}
