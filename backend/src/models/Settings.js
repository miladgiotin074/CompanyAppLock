import mongoose from 'mongoose';
import { config } from '../config.js';

/**
 * Global, singleton settings document (_id === 'global'). The panel edits it;
 * the wake scheduler and online-threshold logic read it.
 */
const SettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'global' },
    heartbeatMinutes: {
      type: Number,
      default: config.defaultHeartbeatMinutes,
      min: 1,
      max: 1440,
    },
    onlineGraceMultiplier: {
      type: Number,
      default: config.onlineGraceMultiplier,
      min: 1,
    },
    stabilityNotifDelayMinutes: {
      type: Number,
      default: config.defaultStabilityNotifDelayMinutes,
      min: 0,
    },
    // GLOBAL monitored (locked) app list — applied to ALL devices. Clients pull
    // it on heartbeat whenever their cached version differs from monitoredVersion.
    monitoredPackages: { type: [String], default: [] },
    monitoredVersion: { type: Number, default: 1 },

    // Server address every client talks to. Pushed to the whole fleet over FCM
    // (dedicated SET_SERVER broadcast + carried on every wake pulse), so clients
    // never hard-code it. Must be the full API base, e.g. https://x/api/v1.
    serverUrl: { type: String, default: '' },
  },
  { timestamps: true, _id: false },
);

export const Settings = mongoose.model('Settings', SettingsSchema);

/** Fetch (and lazily create) the singleton settings document. */
export async function getSettings() {
  let doc = await Settings.findById('global');
  if (!doc) doc = await Settings.create({ _id: 'global' });
  return doc;
}
