// Relative by default so the Vite proxy (and an ngrok tunnel in front of it)
// keeps API calls on the same origin. Set VITE_API_BASE only to bypass the proxy.
const BASE = import.meta.env.VITE_API_BASE || '/api/v1';
export const REFRESH_MS = parseInt(import.meta.env.VITE_REFRESH_MS || '15000', 10);

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true', // skip ngrok's interstitial page
    },
    ...opts,
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
  listDevices: ({ page = 1, limit = 50, q = '', online = '', uninstalled = '' } = {}) =>
    req(
      `/devices?page=${page}&limit=${limit}&q=${encodeURIComponent(q)}` +
        (online ? `&online=${online}` : '') +
        (uninstalled ? `&uninstalled=${uninstalled}` : ''),
    ),
  getDevice: (id) => req(`/devices/${encodeURIComponent(id)}`),
  getCommand: (id) => req(`/commands/${encodeURIComponent(id)}`),
  getApps: (id) => req(`/devices/${encodeURIComponent(id)}/apps`),
  ping: (id) =>
    req(`/devices/${encodeURIComponent(id)}/ping`, { method: 'POST', body: '{}' }),
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
  getSettings: () => req('/settings'),
  updateSettings: (patch) =>
    req('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  broadcastWake: () => req('/broadcast/wake', { method: 'POST', body: '{}' }),
};
