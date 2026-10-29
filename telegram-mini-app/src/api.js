// Relative by default so the Vite proxy (and an ngrok tunnel in front of it)
// keeps API calls on the same origin. Set VITE_API_BASE only to bypass the proxy.
const BASE = import.meta.env.VITE_API_BASE || '/api/v1';
export const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_MS || '15000', 10);

import { getInitDataRaw } from './telegram.js';

async function req(path, opts = {}) {
  const { headers, body, ...rest } = opts;
  const res = await fetch(BASE + path, {
    ...rest,
    body,
    headers: {
      ...(body != null ? { 'Content-Type': 'application/json' } : {}),
      'ngrok-skip-browser-warning': 'true',
      'X-Telegram-Init-Data': getInitDataRaw(),
      ...headers,
    },
  });
  if (!res.ok) {
    let msg;
    try {
      msg = (await res.json()).error;
    } catch {
      /* ignore */
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  listDevices: ({ page = 1, limit = 50, q = '', online = '', uninstalled = '', monitored = '', port = '' } = {}) =>
    req(
      `/devices?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}` +
        (online ? `&online=${online}` : '') +
        (uninstalled ? `&uninstalled=${uninstalled}` : '') +
        (monitored ? `&monitored=${monitored}` : '') +
        (port ? `&port=${encodeURIComponent(port)}` : ''),
    ),
  getDevice: (id) => req(`/devices/${encodeURIComponent(id)}`),
  getCommand: (id) => req(`/commands/${encodeURIComponent(id)}`),
  getApps: (id) => req(`/devices/${encodeURIComponent(id)}/apps`),
  ping: (id) =>
    req(`/devices/${encodeURIComponent(id)}/ping`, { method: 'POST', body: '{}' }),
  refreshDevice: (id, scope) =>
    req(`/devices/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),
  updateMonitored: (packages) =>
    req('/settings/monitored', {
      method: 'PUT',
      body: JSON.stringify({ packages }),
    }),
  setIcon: (id, action, variant) =>
    req(`/devices/${encodeURIComponent(id)}/icon`, {
      method: 'POST',
      body: JSON.stringify({ action, variant }),
    }),
  setAnnotation: (id, { label, note }) =>
    req(`/devices/${encodeURIComponent(id)}/annotation`, {
      method: 'PUT',
      body: JSON.stringify({ label, note }),
    }),
  getSettings: () => req('/settings'),
  updateSettings: (patch) =>
    req('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  // Set the fleet-wide server address; the backend pushes it to every device over FCM.
  setServerUrl: (url) =>
    req('/settings/server-url', { method: 'PUT', body: JSON.stringify({ url }) }),
  broadcastWake: () => req('/broadcast/wake', { method: 'POST', body: '{}' }),

  // Per-admin panel prefs (pins / custom tabs / members), stored server-side.
  getAdminPrefs: () => req('/admin/prefs'),
  saveAdminPrefs: (prefs) =>
    req('/admin/prefs', { method: 'PUT', body: JSON.stringify(prefs) }),

  me: () => req('/me'),
  listPorts: () => req('/ports'),
  createPort: (body) => req('/ports', { method: 'POST', body: JSON.stringify(body) }),
  updatePort: (code, body) =>
    req(`/ports/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePort: (code) => req(`/ports/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  preparePortBind: (code) =>
    code
      ? req(`/ports/${encodeURIComponent(code)}/prepare-bind`, { method: 'POST', body: '{}' })
      : req('/ports/prepare-bind', { method: 'POST', body: '{}' }),
  getBind: (requestId) => req(`/binds/${encodeURIComponent(requestId)}`),
  unbindPort: (code) =>
    req(`/ports/${encodeURIComponent(code)}/unbind`, { method: 'POST', body: '{}' }),
};
