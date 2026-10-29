import { config } from '../config.js';

/**
 * Lightweight Telegram Bot API helper for group notices (install + port announce).
 * Does not start polling — that stays in telegram-mini-app/bot.js.
 */
export async function callTelegram(method, body) {
  const token = config.telegramBotToken;
  if (!token) return { ok: false, skipped: true, reason: 'no-token' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      return { ok: false, error: data.description || res.statusText };
    }
    return { ok: true, result: data.result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function sendGroupHtml(chatId, html, replyMarkup = null, replyTo = 0) {
  if (!chatId) return { ok: false, skipped: true };
  const body = {
    chat_id: chatId,
    text: html,
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (replyTo > 0) body.reply_to_message_id = replyTo;
  return callTelegram('sendMessage', body);
}

export async function pinGroupMessage(chatId, messageId) {
  if (!chatId || !messageId) return { ok: false, skipped: true };
  return callTelegram('pinChatMessage', {
    chat_id: chatId,
    message_id: messageId,
    disable_notification: true,
  });
}

export async function sendGroupMarkdownV2(chatId, text, replyMarkup = null) {
  if (!chatId) return { ok: false, skipped: true };
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    link_preview_options: { is_disabled: true },
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return callTelegram('sendMessage', body);
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeMarkdownV2(value) {
  return String(value ?? '').replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Register a one-shot "pick a group" button for this Telegram user.
 * The Mini App must call requestChat with the returned id — not our requestId.
 * Passing the raw request id makes Telegram answer REQUEST_EXPIRED.
 */
export function requestChatButton(requestId) {
  return {
    text: 'انتخاب گروه',
    request_chat: {
      request_id: requestId,
      chat_is_channel: false,
      request_title: true,
      request_username: true,
      request_photo: true,
    },
  };
}

export async function savePreparedChatButton(userId, requestId) {
  return callTelegram('savePreparedKeyboardButton', {
    user_id: userId,
    button: requestChatButton(requestId),
  });
}

const RULE = '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬';

/** Same shape as the private /start welcome: greeting, one bold line, rule, call to action. */
export function portConnectedText(name) {
  const safe = escapeMarkdownV2((name || '').trim() || 'بدون اسم');
  return [
    `👋 *${escapeMarkdownV2('پورت وصل شد')}\\!*`,
    '',
    `• *${safe}*`,
    '',
    RULE,
    '',
    `🚀 *${escapeMarkdownV2('برای ورود، دکمهٔ زیر را بزنید.')}*`,
  ].join('\n');
}

function panelPath(base, path) {
  if (!base) return '';
  try {
    const url = new URL(base);
    const extra = !path || path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
    const prefix = url.pathname.replace(/\/$/, '');
    url.pathname = `${prefix}${extra}` || '/';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return base;
  }
}

async function panelTargets(path = '/', startParam = '') {
  const menu = await callTelegram('getChatMenuButton', {});
  const button = menu.result;
  const httpsUrl = button?.type === 'web_app' ? panelPath(String(button.web_app?.url || ''), path) : '';
  const me = await callTelegram('getMe', {});
  const username = me.result?.username || '';
  const safe = /^[A-Za-z0-9_-]{1,64}$/.test(startParam) ? startParam : '';
  const tme = username
    ? `https://t.me/${username}?startapp${safe ? `=${safe}` : ''}`
    : '';
  return { httpsUrl, tme };
}

function installLine(label, value) {
  const shown = escapeMarkdownV2(String(value ?? '').trim() || '—');
  return `• *${escapeMarkdownV2(label)}:* \u200E${shown}`;
}

/** Welcome shape, plus the install fields, for the port group. */
export function installLogText({
  reinstall = false,
  portName = '',
  portCode = '',
  deviceName = '',
  deviceId = '',
  android = '',
  appVersion = '',
  label = '',
} = {}) {
  const title = reinstall ? 'نصب دوباره' : 'نصب جدید';
  const lines = [
    `👋 *${escapeMarkdownV2(title)}\\!*`,
    '',
    installLine('پورت', `${String(portName || '').trim() || 'بدون اسم'} · ${portCode}`),
    installLine('دستگاه', deviceName || 'نامشخص'),
    installLine('شناسه', deviceId),
    installLine('اندروید', android || '?'),
    installLine('نسخه اپ', appVersion || '—'),
  ];
  if (String(label || '').trim()) lines.push(installLine('برچسب', label));
  lines.push('', RULE, '', `🚀 *${escapeMarkdownV2('برای مدیریت این کاربر، دکمهٔ زیر را بزنید.')}*`);
  return lines.join('\n');
}

/**
 * Glass web_app button. Groups often reject it, so the caller can fall back to the t.me link.
 * `path` opens that panel page. `startParam` is the same target when the link is t.me.
 */
export async function sendPanelMessage(chatId, text, { label = 'باز کردن پنل', path = '/', startParam = '' } = {}) {
  const { httpsUrl, tme } = await panelTargets(path, startParam);
  const glass = httpsUrl
    ? { inline_keyboard: [[{ text: label, web_app: { url: httpsUrl } }]] }
    : null;
  const link = tme || httpsUrl;
  const plain = link ? { inline_keyboard: [[{ text: label, url: link }]] } : null;
  if (glass) {
    const sent = await sendGroupMarkdownV2(chatId, text, glass);
    if (sent.ok) return sent;
  }
  if (plain) return sendGroupMarkdownV2(chatId, text, plain);
  return sendGroupMarkdownV2(chatId, text);
}

/** Group command menu: only /start. */
export async function setGroupStartCommand(chatId) {
  if (!chatId) return { ok: false, skipped: true };
  return callTelegram('setMyCommands', {
    commands: [{ command: 'start', description: 'باز کردن پنل' }],
    scope: { type: 'chat', chat_id: chatId },
  });
}
