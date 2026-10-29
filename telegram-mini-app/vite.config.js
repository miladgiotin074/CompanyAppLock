import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Mini Apps must be served over HTTPS. ngrok provides that.
const NGROK_HOSTS = [
  '.ngrok-free.app',
  '.ngrok-free.dev',
  '.ngrok.io',
  '.ngrok.app',
  '.ngrok.dev',
];

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
