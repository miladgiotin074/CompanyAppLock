import { getMessaging, isFcmEnabled } from '../firebase.js';
import { config } from '../config.js';

/**
 * FCM strategy (operator-confirmed):
 *   - Topic Messaging for the periodic wake pulse / broadcasts (one publish → all).
 *   - Direct token for targeted commands (ping, lock-list, icon).
 *
 * All messages are DATA-ONLY + HIGH priority. Data-only high-priority messages
 * invoke the client's onMessageReceived even in the background/Doze, which the
 * client uses to revive the lock engine before acting on the command.
 */

function stringifyData(obj) {
  // FCM data values must all be strings.
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

function baseMessage(data) {
  return {
    data: stringifyData(data),
    android: {
      priority: 'high',
      // No "notification" block on purpose: keep it a silent data message.
      ttl: 60 * 1000, // wake pulses are only useful if fresh
    },
  };
}

export async function sendToToken(token, data) {
  if (!isFcmEnabled()) return { ok: false, skipped: true, reason: 'fcm-disabled' };
  if (!token) return { ok: false, skipped: true, reason: 'no-token' };
  try {
    const id = await getMessaging().send({ ...baseMessage(data), token });
    return { ok: true, id };
  } catch (err) {
    // A 404/unregistered token means the app was uninstalled or token rotated.
    return {
      ok: false,
      error: err.message,
      code: err.errorInfo?.code || err.code || null,
    };
  }
}

export async function sendToTopic(data, topic = config.fcmTopic) {
  if (!isFcmEnabled()) return { ok: false, skipped: true, reason: 'fcm-disabled' };
  try {
    const id = await getMessaging().send({ ...baseMessage(data), topic });
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Server-side topic subscription (safety net; the client also subscribes). */
export async function subscribeTokenToTopic(token, topic = config.fcmTopic) {
  if (!isFcmEnabled() || !token) return { ok: false, skipped: true };
  try {
    await getMessaging().subscribeToTopic([token], topic);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function unsubscribeTokenFromTopic(token, topic = config.fcmTopic) {
  if (!isFcmEnabled() || !token) return { ok: false, skipped: true };
  try {
    await getMessaging().unsubscribeFromTopic([token], topic);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** True when an FCM error code means the app was uninstalled / token is dead. */
export function isTokenGone(code) {
  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/invalid-argument'
  );
}

/**
 * Validate tokens WITHOUT delivering anything (dryRun), so uninstall detection
 * never disturbs devices. Returns the tokens that are gone (unregistered).
 * Caller batches to ≤500 per call (FCM multicast limit).
 */
export async function validateTokens(tokens) {
  if (!isFcmEnabled() || !tokens.length) return { goneTokens: [] };
  try {
    const resp = await getMessaging().sendEachForMulticast(
      { tokens, data: { cmd: 'VALIDATE' } },
      true, // dryRun
    );
    const gone = [];
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.errorInfo?.code || r.error?.code;
        if (isTokenGone(code)) gone.push(tokens[i]);
      }
    });
    return { goneTokens: gone };
  } catch (err) {
    return { goneTokens: [], error: err.message };
  }
}
