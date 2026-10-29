import mongoose from 'mongoose';

const AppEntrySchema = new mongoose.Schema(
  {
    package: { type: String, required: true },
    label: { type: String, default: '' },
    system: { type: Boolean, default: false }, // system app vs user-installed
  },
  { _id: false },
);

/**
 * Installed-app lists can be large (hundreds of entries), so they live in a
 * separate collection and are never embedded in the hot Device document.
 */
const InstalledAppsSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    apps: { type: [AppEntrySchema], default: [] },
  },
  { timestamps: true },
);

// Multikey index so "devices that have a monitored package" queries are fast.
InstalledAppsSchema.index({ 'apps.package': 1 });

export const InstalledApps = mongoose.model(
  'InstalledApps',
  InstalledAppsSchema,
);
