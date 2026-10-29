import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;
const panelDist = join(repo, 'telegram-mini-app', 'dist');

if (!existsSync(join(panelDist, 'index.html'))) {
  console.error('Panel build missing. Run: npm run build:panel');
  process.exit(1);
}

const services = [
  {
    name: 'backend',
    cwd: join(repo, 'backend'),
    args: ['src/index.js'],
    env: { ...process.env, PANEL_DIST: panelDist },
  },
  {
    name: 'bot',
    cwd: join(repo, 'telegram-mini-app'),
    args: ['bot.js'],
    env: process.env,
  },
];

const children = [];
let stopping = false;

function prefix(name, chunk, stream) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (!line) continue;
    stream.write(`[${name}] ${line}\n`);
  }
}

function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill();
  }
}

for (const service of services) {
  const child = spawn(node, service.args, {
    cwd: service.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: service.env,
  });
  children.push(child);
  child.stdout.on('data', (chunk) => prefix(service.name, chunk, process.stdout));
  child.stderr.on('data', (chunk) => prefix(service.name, chunk, process.stderr));
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[${service.name}] stopped (${signal || code})`);
    stopAll();
    process.exit(code || 1);
  });
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});
