import crypto from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Temporary row while the Mini App / bot finishes Telegram requestChat.
 * purpose: "create" (new port) | "port" (bind existing) | unused others.
 */
const PendingBindSchema = new mongoose.Schema(
  {
    _id: { type: Number }, // requestId
    purpose: { type: String, default: 'create' },
    portCode: { type: String, default: '' },
    groupId: { type: Number, default: 0 },
    groupTitle: { type: String, default: '' },
    groupLink: { type: String, default: '' },
    groupUsername: { type: String, default: '' },
    groupType: { type: String, default: '' },
    groupMemberCount: { type: Number, default: 0 },
    groupPhotoMime: { type: String, default: '' },
    groupPhotoData: { type: Buffer, default: null },
    botAdminOk: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
);

// Auto-expire stale pending binds (and their up-to-512KB photo buffers) 1h after
// creation — the requestChat flow completes in seconds, so nothing lingers.
PendingBindSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

export const PendingBind = mongoose.model('PendingBind', PendingBindSchema);

/** Positive signed 32-bit id. Telegram rejects anything outside that range. */
export async function nextRequestId() {
  for (let i = 0; i < 6; i++) {
    const id = crypto.randomInt(1, 2_000_000_000);
    const exists = await PendingBind.exists({ _id: id });
    if (!exists) return id;
  }
  throw new Error('request id');
}
