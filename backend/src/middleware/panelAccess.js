import { getAdminId } from '../utils/telegram.js';
import { config } from '../config.js';
import { Port } from '../models/Port.js';

/**
 * Panel access like Base:
 * - admin: ADMIN_TELEGRAM_ID (owner) — all ports + settings
 * - manager: listed on a port's managers[] — only those ports' devices
 * - none: 401/403
 *
 * Without TELEGRAM_BOT_TOKEN (local dev) everyone with initData (or none) is admin.
 */

export function ownerTelegramIds() {
  const ids = new Set();
  for (const part of String(config.adminTelegramIds || '').split(',')) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0) ids.add(String(n));
  }
  return ids;
}

export function isOwnerId(adminId) {
  const owners = ownerTelegramIds();
  if (owners.size === 0) {
    // No ADMIN_TELEGRAM_ID configured → treat verified panel users as owner (dev / single-tenant).
    return Boolean(adminId);
  }
  return owners.has(String(adminId));
}

export async function portsManagedBy(telegramId) {
  const id = Number(telegramId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const rows = await Port.find({ managers: id }).select({ _id: 1 }).lean();
  return rows.map((r) => r._id).filter(Boolean);
}

export async function resolveAccess(req) {
  const adminId = getAdminId(req, config.telegramBotToken);
  if (!config.telegramBotToken) {
    return { role: 'admin', adminId: adminId || 'dev', ports: [] };
  }
  if (!adminId) {
    return { role: 'none', adminId: null, ports: [] };
  }
  if (isOwnerId(adminId)) {
    return { role: 'admin', adminId, ports: [] };
  }
  const ports = await portsManagedBy(adminId);
  if (ports.length > 0) {
    return { role: 'manager', adminId, ports };
  }
  return { role: 'none', adminId, ports: [] };
}

/** Any panel opener (owner or port manager). */
export async function requirePanel(req, reply) {
  const access = await resolveAccess(req);
  if (access.role === 'none') {
    return reply.code(401).send({ error: 'unauthorized: open this panel from inside Telegram' });
  }
  req.panelAccess = access;
  req.adminId = access.adminId;
}

/** Owner only — create/delete ports, settings, global wake. */
export async function requireOwner(req, reply) {
  const access = await resolveAccess(req);
  if (access.role !== 'admin') {
    return reply.code(403).send({ error: 'forbidden: owner only' });
  }
  req.panelAccess = access;
  req.adminId = access.adminId;
}

/** Bot long-poller calling the API with the shared bot token. */
export function requireBot(req, reply) {
  const token = config.telegramBotToken;
  if (!token) return; // local: allow
  const header = req.headers['x-telegram-bot-token'] || '';
  if (header !== token) {
    return reply.code(401).send({ error: 'unauthorized bot' });
  }
  req.panelAccess = { role: 'admin', adminId: 'bot', ports: [] };
}

export async function requirePanelOrBot(req, reply) {
  const token = config.telegramBotToken;
  const header = req.headers['x-telegram-bot-token'] || '';
  if (token && header === token) {
    req.panelAccess = { role: 'admin', adminId: 'bot', ports: [] };
    return;
  }
  return requirePanel(req, reply);
}

export function canSeePort(access, code) {
  if (!access || access.role === 'admin') return true;
  if (access.role === 'manager') return access.ports.includes(code);
  return false;
}
