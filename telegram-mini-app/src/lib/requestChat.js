import { postEvent } from '@tma.js/sdk-react';

/** Open Telegram's group picker for a prepared request_id (string). */
export function requestTelegramGroup(preparedId) {
  const webApp = window.Telegram?.WebApp;
  if (typeof webApp?.requestChat === 'function') {
    try {
      // One argument only. A callback here is read as "channel" on some clients.
      webApp.requestChat(String(preparedId));
      return Promise.resolve(true);
    } catch {
      /* fall through to the bridge event */
    }
  }
  try {
    postEvent('web_app_request_chat', { req_id: preparedId });
    return Promise.resolve(true);
  } catch {
    return Promise.resolve(false);
  }
}
