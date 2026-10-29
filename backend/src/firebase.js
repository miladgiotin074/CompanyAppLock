import { readFileSync } from 'node:fs';
import admin from 'firebase-admin';
import { config } from './config.js';

let messaging = null;
let enabled = false;

/**
 * Initialize the Firebase Admin SDK from a service-account JSON file. If the
 * file is missing the backend still boots (FCM calls become no-ops that log a
 * warning) so the panel/API are usable before Firebase is wired up.
 */
export function initFirebase(logger) {
  try {
    const raw = readFileSync(config.firebaseCredentials, 'utf8');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    messaging = admin.messaging();
    enabled = true;
    logger?.info('Firebase Admin initialized — FCM enabled');
  } catch (err) {
    enabled = false;
    logger?.warn(
      { err: err.message },
      'Firebase credentials not loaded — FCM is DISABLED (API/panel still work)',
    );
  }
}

export function isFcmEnabled() {
  return enabled;
}

export function getMessaging() {
  return messaging;
}
