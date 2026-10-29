import { Idempotency } from '../models/Idempotency.js';

/**
 * Idempotency for device-side write endpoints. The client's sync engine sends a
 * unique `Idempotency-Key` header per logical request; a retry with the same key
 * replays the stored response instead of re-applying the write.
 *
 * Usage:
 *   - attach `idempotencyPreHandler` as a route preHandler, and
 *   - register `idempotencyOnSend` once as a global onSend hook.
 */
export async function idempotencyPreHandler(req, reply) {
  const key = req.headers['idempotency-key'];
  if (!key) return;
  req.idempotencyKey = key;

  const existing = await Idempotency.findOne({ key }).lean();
  if (existing) {
    req._idemReplayed = true;
    reply.code(existing.statusCode).send(existing.body);
    return reply; // short-circuit the handler
  }
}

export async function idempotencyOnSend(req, reply, payload) {
  const key = req.idempotencyKey;
  if (!key || req._idemReplayed) return payload;
  if (reply.statusCode >= 200 && reply.statusCode < 300) {
    let body = payload;
    if (typeof payload === 'string') {
      try {
        body = JSON.parse(payload);
      } catch {
        /* non-JSON body, store as-is */
      }
    }
    try {
      await Idempotency.updateOne(
        { key },
        { $setOnInsert: { key, statusCode: reply.statusCode, body } },
        { upsert: true },
      );
    } catch {
      /* duplicate key race — safe to ignore */
    }
  }
  return payload;
}
