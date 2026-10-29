import { useEffect, useState } from 'react';
import { api } from '../api.js';

/**
 * Owner vs port-manager access (same idea as Base).
 * role: 'admin' | 'manager' | 'none' | 'loading'
 */
export function usePanelAccess() {
  const [access, setAccess] = useState({ role: 'loading', ports: [], adminId: null });

  useEffect(() => {
    let cancel = false;
    api
      .me()
      .then((body) => {
        if (cancel) return;
        setAccess({
          role: body.role || 'none',
          ports: Array.isArray(body.ports) ? body.ports : [],
          adminId: body.adminId || null,
        });
      })
      .catch(() => {
        if (!cancel) setAccess({ role: 'none', ports: [], adminId: null });
      });
    return () => {
      cancel = true;
    };
  }, []);

  return access;
}

export function isOwner(access) {
  return access?.role === 'admin';
}

export function canOpenPanel(access) {
  return access?.role === 'admin' || access?.role === 'manager';
}
