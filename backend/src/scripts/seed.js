/**
 * Minimal seed: ensures the global settings document exists and optionally sets
 * a default lock list. Run with `npm run seed`.
 */
import { connectDb } from '../db.js';
import { Settings, getSettings } from '../models/Settings.js';
import mongoose from 'mongoose';

async function run() {
  await connectDb(console);
  const s = await getSettings();
  console.log('Settings ready:', s.toObject());
  await mongoose.connection.close();
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
