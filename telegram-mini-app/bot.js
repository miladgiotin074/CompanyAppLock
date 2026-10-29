import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

function loadEnv(file) {
  const env = {};
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return env;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = { ...loadEnv(join(root, '../backend/.env')), ...loadEnv(join(root, '.env')) };
const token = env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is missing in telegram-mini-app/.env');
  process.exit(1);
}

const BACKEND = (env.BACKEND_URL || env.REALTIME_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const API = `${BACKEND}/api/v1`;

const RULE = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';
let botUsername = '';

function esc(value) {
  return String(value ?? '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function note(title, lead, cta) {
  return [`👋 *${title}*`, `_${lead}_`, '', RULE, '', `🚀 *${cta}*`].join('\n');
}

export function welcomeText(user) {
  const name = esc(user?.first_name?.trim() || 'دوست');
  return [
    `👋 *سلام ${name} جان\\!*`,
    '',
    '• *به پنل مدیریت کفتار خوش اومدی*',
    '',
    RULE,
    '',
    `🚀 *${esc('برای ورود، دکمهٔ زیر را بزنید.')}*`,
  ].join('\n');
}

function missingMiniAppText() {
  return note(
    `${esc('آدرس پنل پیدا نشد')}\\!`,
    esc('دکمهٔ منوی ربات باید یک مینی‌اپ باشد.'),
    esc('بعد از تنظیم در BotFather، دوباره start را بزنید.'),
  );
}

function ownerIds() {
  const ids = new Set();
  for (const part of String(env.ADMIN_TELEGRAM_ID || '').split(',')) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0) ids.add(n);
  }
  return ids;
}

function isOwner(userId) {
  const allowed = ownerIds();
  if (allowed.size === 0) return true; // lab: no owner list → any user may manage
  return allowed.has(Number(userId));
}

async function api(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    const description = data.description || res.statusText || 'telegram api error';
    const error = new Error(`${method} failed: ${description}`);
    error.method = method;
    throw error;
  }
  return data.result;
}

async function backend(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Token': token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function sectionUrl(base, path = '/') {
  const url = new URL(base);
  const extra = !path || path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
  const prefix = url.pathname.replace(/\/$/, '');
  url.pathname = `${prefix}${extra}` || '/';
  return url.toString();
}

async function miniAppBase(chatId, chatType = 'private') {
  // getChatMenuButton only accepts a private user id. A group id returns invalid chat_id.
  let button = null;
  if (chatType === 'private' && chatId) {
    try {
      const specific = await api('getChatMenuButton', { chat_id: chatId });
      if (specific && specific.type !== 'default') button = specific;
    } catch {
      button = null;
    }
  }
  if (!button) button = await api('getChatMenuButton');
  const base = button?.type === 'web_app' ? button.web_app?.url : '';
  if (!base) {
    const error = new Error('menu button is not a web app');
    error.code = 'NO_MINI_APP';
    throw error;
  }
  return base;
}

async function tmePanelUrl() {
  if (!botUsername) {
    const me = await api('getMe');
    botUsername = me.username || '';
  }
  return botUsername ? `https://t.me/${botUsername}?startapp` : '';
}

export async function sendSection(chatId, { path = '/', label, text, chatType = 'private' }) {
  const inGroup = chatType === 'group' || chatType === 'supergroup';
  const url = sectionUrl(await miniAppBase(chatId, inGroup ? 'group' : chatType), path);
  const glass = { inline_keyboard: [[{ text: label, web_app: { url } }]] };
  if (!inGroup) {
    await api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: glass,
    });
    return;
  }
  try {
    await api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: glass,
    });
  } catch {
    const link = (await tmePanelUrl()) || url;
    await api('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: [[{ text: label, url: link }]] },
    });
  }
}

async function onStart(message) {
  const text = welcomeText(message.from);
  try {
    await sendSection(message.chat.id, {
      path: '/',
      label: 'باز کردن پنل',
      text,
      chatType: message.chat?.type,
    });
  } catch (err) {
    if (err.code !== 'NO_MINI_APP') throw err;
    await api('sendMessage', {
      chat_id: message.chat.id,
      text: missingMiniAppText(),
      parse_mode: 'MarkdownV2',
    });
  }
}

async function isBotGroupAdmin(chatId) {
  try {
    const me = await api('getMe');
    const member = await api('getChatMember', { chat_id: chatId, user_id: me.id });
    return member.status === 'administrator' || member.status === 'creator';
  } catch {
    return false;
  }
}

function largestPhotoId(photo) {
  let best = '';
  let area = -1;
  for (const item of photo || []) {
    const id = (item.file_id || '').trim();
    if (!id) continue;
    const next = (item.width || 0) * (item.height || 0);
    if (next >= area) {
      area = next;
      best = id;
    }
  }
  return best;
}

async function loadPhotoPayload(fileId) {
  if (!fileId) return null;
  try {
    const file = await api('getFile', { file_id: fileId });
    const path = file.file_path;
    if (!path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${path}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 512 * 1024) return null;
    return { data: buf.toString('base64'), mime: 'image/jpeg' };
  } catch {
    return null;
  }
}

function publicGroupLink(username) {
  const name = String(username || '').replace(/^@/, '').trim();
  return /^[A-Za-z0-9_]{4,}$/.test(name) ? `https://t.me/${name}` : '';
}

async function handleChatShared(message) {
  const shared = message.chat_shared;
  if (!shared?.request_id || !shared.chat_id) return false;
  if (!isOwner(message.from?.id)) return true;
  let chat = null;
  try {
    chat = await api('getChat', { chat_id: shared.chat_id });
  } catch {
    chat = null;
  }
  const title = (shared.title || chat?.title || '').trim();
  const botAdminOk = await isBotGroupAdmin(shared.chat_id);
  let groupLink = publicGroupLink(shared.username || chat?.username);
  if (!groupLink && typeof chat?.invite_link === 'string') groupLink = chat.invite_link;
  if (!groupLink && botAdminOk) {
    try {
      const exported = await api('exportChatInviteLink', { chat_id: shared.chat_id });
      if (typeof exported === 'string') groupLink = exported;
    } catch {
      /* private group without an invite permission */
    }
  }
  const photoId =
    largestPhotoId(shared.photo) || chat?.photo?.big_file_id || chat?.photo?.small_file_id || '';
  const photoPayload = photoId ? await loadPhotoPayload(photoId) : null;
  const username = String(shared.username || chat?.username || '').replace(/^@/, '').trim();
  const groupType = String(chat?.type || '').trim();
  let memberCount = 0;
  try {
    const count = await api('getChatMemberCount', { chat_id: shared.chat_id });
    if (Number.isFinite(count)) memberCount = count;
  } catch {
    /* member count is best-effort; a private group may refuse it */
  }
  await backend('/ports/bind-shared', {
    method: 'POST',
    body: {
      requestId: shared.request_id,
      groupId: shared.chat_id,
      groupTitle: title,
      groupLink,
      groupUsername: username,
      groupType,
      groupMemberCount: memberCount,
      botAdminOk,
      groupPhotoData: photoPayload?.data || '',
      groupPhotoMime: photoPayload?.mime || '',
    },
  });
  return true;
}

async function main() {
  const me = await api('getMe');
  botUsername = me.username || '';
  await api('deleteWebhook', { drop_pending_updates: false });
  await api('setMyCommands', {
    commands: [{ command: 'start', description: 'باز کردن پنل' }],
  }).catch(() => {});
  console.log(`Bot @${me.username} is polling. Backend: ${API}`);
  try {
    const base = await miniAppBase();
    console.log(`Menu button web app: ${base}`);
  } catch {
    console.error('Menu button is not a web app. Set it in BotFather before /start can open the panel.');
  }

  let offset = 0;
  for (;;) {
    let updates = [];
    try {
      updates = await api('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });
    } catch (err) {
      console.error(err.message);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      try {
        const message = update.message;
        if (!message) continue;
        if (message.chat_shared) {
          await handleChatShared(message);
          continue;
        }
        const text = message.text || '';
        if (text.startsWith('/start')) {
          await onStart(message);
        }
      } catch (err) {
        console.error(err.message);
      }
    }
  }
}

const launchedDirectly = import.meta.url === pathToFileURL(process.argv[1] || '').href;
if (launchedDirectly) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
