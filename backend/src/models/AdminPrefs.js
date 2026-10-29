import mongoose from 'mongoose';

const CustomTabSchema = new mongoose.Schema(
  { id: { type: String, required: true }, label: { type: String, default: '' } },
  { _id: false },
);

/**
 * Per-admin (Telegram user) panel preferences — pins, custom tabs and their
 * members. Stored server-side keyed by the Telegram user id so they follow the
 * admin across devices/browsers and are never shared with other admins.
 */
const AdminPrefsSchema = new mongoose.Schema(
  {
    _id: { type: String }, // Telegram user id (string)
    customTabs: { type: [CustomTabSchema], default: [] },
    members: { type: mongoose.Schema.Types.Mixed, default: {} }, // { tabId: [deviceId] }
    pins: { type: mongoose.Schema.Types.Mixed, default: {} }, // { tabKey: [deviceId] }
  },
  { timestamps: true },
);

export const AdminPrefs = mongoose.model('AdminPrefs', AdminPrefsSchema);
