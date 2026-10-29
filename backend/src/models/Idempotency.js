import mongoose from 'mongoose';

/**
 * Stores the response of a completed, client-keyed write so an at-least-once
 * retry from the device's sync engine is applied effectively-once. Entries
 * self-expire after 24h via a TTL index.
 */
const IdempotencySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    statusCode: { type: Number, required: true },
    body: { type: mongoose.Schema.Types.Mixed, default: null },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
  },
  { versionKey: false },
);

export const Idempotency = mongoose.model('Idempotency', IdempotencySchema);
