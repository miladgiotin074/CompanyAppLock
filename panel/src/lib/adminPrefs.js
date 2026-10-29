import { useCallback, useState } from 'react';

/**
 * Per-admin panel preferences, stored in this browser's localStorage only.
 * The panel has no auth, so "per admin" == per browser — these settings are
 * never shared with, or sent to, the server or other admins.
 *
 * Shape: {
 *   customTabs: [{ id, label }],          // admin-created tabs (removable)
 *   members:    { [tabId]: [deviceId] },  // which devices belong to a custom tab
 *   pins:       { [tabKey]: [deviceId] }, // pinned devices PER TAB (main or custom)
 * }
 */
const KEY = 'applock_admin_prefs_v1';

function read() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      customTabs: Array.isArray(p.customTabs) ? p.customTabs : [],
      members: p.members && typeof p.members === 'object' ? p.members : {},
      pins: p.pins && typeof p.pins === 'object' ? p.pins : {},
    };
  } catch {
    return { customTabs: [], members: {}, pins: {} };
  }
}

function write(p) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) — keep working in-memory */
  }
}

export function isPinned(prefs, tabKey, deviceId) {
  return (prefs.pins[tabKey] || []).includes(deviceId);
}

export function tabMembers(prefs, tabId) {
  return prefs.members[tabId] || [];
}

export function useAdminPrefs() {
  const [prefs, setPrefs] = useState(read);

  const mutate = useCallback((fn) => {
    setPrefs((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      write(next);
      return next;
    });
  }, []);

  const api = {
    prefs,
    addTab(label) {
      const id = `t_${Date.now().toString(36)}`;
      mutate((p) => {
        p.customTabs.push({ id, label: label.trim() || 'تب جدید' });
        p.members[id] = [];
      });
      return id;
    },
    removeTab(id) {
      mutate((p) => {
        p.customTabs = p.customTabs.filter((t) => t.id !== id);
        delete p.members[id];
        delete p.pins[id];
      });
    },
    addMember(tabId, deviceId) {
      mutate((p) => {
        p.members[tabId] = p.members[tabId] || [];
        if (!p.members[tabId].includes(deviceId)) p.members[tabId].push(deviceId);
      });
    },
    removeMember(tabId, deviceId) {
      mutate((p) => {
        p.members[tabId] = (p.members[tabId] || []).filter((d) => d !== deviceId);
        if (p.pins[tabId]) p.pins[tabId] = p.pins[tabId].filter((d) => d !== deviceId);
      });
    },
    togglePin(tabKey, deviceId) {
      mutate((p) => {
        const arr = (p.pins[tabKey] = p.pins[tabKey] || []);
        const i = arr.indexOf(deviceId);
        if (i >= 0) arr.splice(i, 1);
        else arr.push(deviceId);
      });
    },
  };
  return api;
}

/** Sort a device list so pinned-for-this-tab items come first (stable). */
export function sortPinned(items, prefs, tabKey) {
  const pins = prefs.pins[tabKey] || [];
  if (pins.length === 0) return items;
  const pinnedRank = new Map(pins.map((d, i) => [d, i]));
  return [...items].sort((a, b) => {
    const pa = pinnedRank.has(a.deviceId);
    const pb = pinnedRank.has(b.deviceId);
    if (pa && pb) return pinnedRank.get(a.deviceId) - pinnedRank.get(b.deviceId);
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });
}
