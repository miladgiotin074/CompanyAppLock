import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

/**
 * Per-admin panel prefs (pins / custom tabs / members), loaded from and saved to
 * the backend keyed by the admin's Telegram user id. Each admin gets their own;
 * they are never shared. Writes are optimistic + debounced.
 *
 * Shape: { customTabs: [{id,label}], members: { [tabId]: [deviceId] },
 *          pins: { [tabKey]: [deviceId] } }
 */
const EMPTY = { customTabs: [], members: {}, pins: {} };

export function isPinned(prefs, tabKey, deviceId) {
  return (prefs.pins[tabKey] || []).includes(deviceId);
}

export function sortPinned(items, prefs, tabKey) {
  const pins = prefs.pins[tabKey] || [];
  if (pins.length === 0) return items;
  const rank = new Map(pins.map((d, i) => [d, i]));
  return [...items].sort((a, b) => {
    const pa = rank.has(a.deviceId);
    const pb = rank.has(b.deviceId);
    if (pa && pb) return rank.get(a.deviceId) - rank.get(b.deviceId);
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });
}

export function useAdminPrefs() {
  const [prefs, setPrefs] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    api
      .getAdminPrefs()
      .then((p) => {
        if (!alive) return;
        setPrefs({
          customTabs: p.customTabs || [],
          members: p.members || {},
          pins: p.pins || {},
        });
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const persist = useCallback((next) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.saveAdminPrefs(next).catch(() => {});
    }, 400);
  }, []);

  const mutate = useCallback(
    (fn) => {
      setPrefs((prev) => {
        const next = JSON.parse(JSON.stringify(prev));
        fn(next);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return {
    prefs,
    ready,
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
}
