import mongoose from 'mongoose';

/**
 * Audit trail of every command sent to a device. The client reports back a
 * result (via POST /command-result) which we match by this document's _id.
 */
const CommandSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['PING', 'LOCK_LIST', 'ICON', 'WAKE', 'REFRESH'],
    },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    transport: { type: String, enum: ['token', 'topic'], default: 'token' },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    rttMs: { type: Number, default: null }, // round-trip time for PING
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

CommandSchema.index({ createdAt: -1 });

export const Command = mongoose.model('Command', CommandSchema);
