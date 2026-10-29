import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { connectDb } from './db.js';
import { initFirebase } from './firebase.js';
import { getSettings } from './models/Settings.js';
import { idempotencyOnSend } from './middleware/idempotency.js';
import { startWakeScheduler, stopWakeScheduler } from './services/wakeScheduler.js';
import { startTokenReaper, stopTokenReaper } from './services/tokenReaper.js';
import deviceRoutes from './routes/devices.js';
import settingsRoutes from './routes/settings.js';
import broadcastRoutes from './routes/broadcast.js';
import adminPrefsRoutes from './routes/adminPrefs.js';
import portRoutes from './routes/ports.js';
import { registerPanel } from './panelStatic.js';
import { existsSync } from 'node:fs';

async function main() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || 'info' },
    bodyLimit: 2 * 1024 * 1024, // installed-app lists can be a few hundred KB
    trustProxy: true,
  });

  // Permissive CORS so the panel works behind ngrok / a tunnel / LAN IP.
  await app.register(cors, {
    origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Idempotency-Key',
      'ngrok-skip-browser-warning',
      'X-Telegram-Init-Data',
    ],
    maxAge: 86400,
  });

  // Global idempotency store hook (paired with per-route preHandler).
  app.addHook('onSend', idempotencyOnSend);

  app.get('/health', async () => ({ ok: true, ts: Date.now() }));

  await app.register(deviceRoutes, { prefix: '/api/v1' });
  await app.register(settingsRoutes, { prefix: '/api/v1' });
  await app.register(broadcastRoutes, { prefix: '/api/v1' });
  await app.register(adminPrefsRoutes, { prefix: '/api/v1' });
  await app.register(portRoutes, { prefix: '/api/v1' });

  const panelDist = process.env.PANEL_DIST;
  if (panelDist && existsSync(panelDist)) {
    registerPanel(app, panelDist);
  }

  // Infrastructure.
  await connectDb(app.log);
  initFirebase(app.log);
  await getSettings(); // ensure the singleton exists
  await startWakeScheduler(app.log);
  await startTokenReaper(app.log);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`CompanyAppLock backend listening on ${config.host}:${config.port}`);

  const shutdown = async (signal) => {
    app.log.info(`${signal} received — shutting down`);
    stopWakeScheduler();
    stopTokenReaper();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
