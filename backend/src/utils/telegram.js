import crypto from 'node:crypto';

/**
 * Verify a Telegram Mini App `initData` string against the bot token (HMAC-SHA256).
 * Returns the parsed user when valid. See core.telegram.org/bots/webapps#validating.
 */
export function verifyInitData(raw, botToken) {
  try {
    if (!raw || !botToken) return { ok: false };
    const params = new URLSearchParams(raw);
    const hash = params.get('hash');
    if (!hash) return { ok: false };

    const pairs = [];
    for (const [k, v] of params) if (k !== 'hash') pairs.push(`${k}=${v}`);
    pairs.sort();
    const dataCheckString = pairs.join('\n');

    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
    if (calc !== hash) return { ok: false };

    const user = JSON.parse(params.get('user') || '{}');
    return { ok: true, user };
  } catch {
    return { ok: false };
  }
}

/** Parse the user without verifying (dev / no-token fallback). */
export function parseUserUnverified(raw) {
  try {
    const user = JSON.parse(new URLSearchParams(raw).get('user') || '{}');
    return user && user.id ? user : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the admin (Telegram user) id from the request's init-data header.
 * With a bot token configured the data is cryptographically verified; without
 * one (dev) the id is read unverified so the mock still works. Returns null if
 * no identity can be determined.
 */
export function getAdminId(req, botToken) {
  const raw = req.headers['x-telegram-init-data'] || '';
  if (!raw) return null;
  if (botToken) {
    const r = verifyInitData(raw, botToken);
    return r.ok && r.user?.id ? String(r.user.id) : null;
  }
  const u = parseUserUnverified(raw);
  return u?.id ? String(u.id) : null;
}
