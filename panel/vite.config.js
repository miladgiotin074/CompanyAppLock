import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ngrok free/paid hostnames. A leading dot allows that domain and every subdomain.
const NGROK_HOSTS = [
  '.ngrok-free.app',
  '.ngrok-free.dev',
  '.ngrok.io',
  '.ngrok.app',
  '.ngrok.dev',
];

// One public origin: the browser talks only to Vite (the ngrok URL).
// /api is forwarded to the local backend, so there is no cross-origin call.
const API_PROXY = {
  '/api': {
    target: 'http://127.0.0.1:3000',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Vite 5.4+ rejects non-localhost Host headers and CORS origins by default.
    allowedHosts: NGROK_HOSTS,
    cors: true,
    proxy: API_PROXY,
  },
  preview: {
    host: true,
    allowedHosts: NGROK_HOSTS,
    cors: true,
    proxy: API_PROXY,
  },
});
