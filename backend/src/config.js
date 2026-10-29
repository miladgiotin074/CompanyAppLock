import 'dotenv/config';

/**
 * Central configuration. Everything is read from the environment with safe
 * defaults so the service boots on a fresh machine with only MONGO_URI +
 * Firebase credentials provided.
 */
export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  corsOrigin: (process.env.CORS_ORIGIN || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/companyapplock',

  firebaseCredentials:
    process.env.FIREBASE_CREDENTIALS || './firebase-service-account.json',
  fcmTopic: process.env.FCM_TOPIC || 'all-devices',

  // Telegram bot token — when set, Mini App init-data is cryptographically
  // verified so each admin's prefs are authenticated. Without it, the admin id
  // is read unverified (dev).
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',

  // Comma-separated Telegram user ids that own the whole panel (create ports,
  // settings). Port managers are stored per-port and only see their ports.
  // Empty = any verified Mini App user is treated as owner (single-tenant / lab).
  adminTelegramIds: process.env.ADMIN_TELEGRAM_ID || '',

  defaultHeartbeatMinutes: parseInt(
    process.env.DEFAULT_HEARTBEAT_MINUTES || '5',
    10,
  ),
  onlineGraceMultiplier: parseFloat(
    process.env.ONLINE_GRACE_MULTIPLIER || '2.5',
  ),
  defaultStabilityNotifDelayMinutes: parseInt(
    process.env.DEFAULT_STABILITY_NOTIF_DELAY_MINUTES || '10',
    10,
  ),
};
