import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

/**
 * Serve the built Telegram Mini App from PANEL_DIST on the same origin as
 * /api/v1. Missing extension-less paths fall back to index.html (client routes).
 */
export function registerPanel(app, distDir) {
  const root = resolve(distDir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    app.log.warn(`PANEL_DIST has no index.html: ${root}`);
    return;
  }

  app.setNotFoundHandler((req, reply) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/api' || urlPath.startsWith('/api/')) {
      return reply.code(404).send({ error: 'not_found' });
    }

    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '').replace(/^[/\\]+/, '');
    const file = resolve(root, rel);
    if (file !== root && !file.startsWith(root + sep)) {
      return reply.code(403).send({ error: 'forbidden' });
    }

    if (rel && existsSync(file) && statSync(file).isFile()) {
      const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
      return reply.type(type).send(createReadStream(file));
    }

    if (rel && extname(rel)) {
      return reply.code(404).send({ error: 'not_found' });
    }

    return reply.type('text/html; charset=utf-8').send(createReadStream(index));
  });

  app.log.info(`Mini App panel served from ${root}`);
}
