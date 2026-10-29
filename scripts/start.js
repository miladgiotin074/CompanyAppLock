import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

const services = [
  {
    name: 'backend',
    cwd: join(repo, 'backend'),
    args: ['src/index.js'],
  },
  {
    name: 'miniapp',
    cwd: join(repo, 'telegram-mini-app'),
    args: ['node_modules/vite/bin/vite.js', '--host', '--port', '5173'],
  },
  {
    name: 'bot',
    cwd: join(repo, 'telegram-mini-app'),
    args: ['bot.js'],
  },
];

const children = [];
let stopping = false;

function prefix(name, chunk, stream) {
  const text = chunk.toString();
  for (const line of text.split(/\r?\n/)) {
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
    env: process.env,
  });
  children.push(child);
  child.stdout.on('data', (chunk) => prefix(service.name, chunk, process.stdout));
  child.stderr.on('data', (chunk) => prefix(service.name, chunk, process.stderr));
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`[${service.name}] stopped (${signal || code})`);
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
