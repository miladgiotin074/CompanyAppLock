import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { askDevice } from '../lib/deviceRefresh.js';
import { cache } from '../lib/cache.js';
import StatusDot from '../components/StatusDot.jsx';
import Spinner from '../components/Spinner.jsx';
import Snackbar from '../components/Snackbar.jsx';
import { shortId } from '../lib/format.js';
import { DeviceContext } from './device/context.js';
import OverviewTab from './device/OverviewTab.jsx';
import AppsTab from './device/AppsTab.jsx';
import ActionsTab from './device/ActionsTab.jsx';
import SwipeRefresh from '../components/SwipeRefresh.jsx';

function sectionFrom(pathname) {
  if (pathname.endsWith('/apps')) return 'apps';
  if (pathname.endsWith('/actions')) return 'actions';
  return 'overview';
}

/**
 * Device shell stays mounted when the user goes back to the list, so returning
 * does not rebuild the page. Section panels stay mounted for the same reason.
 */
export default function DeviceLayout({ id, active }) {
  const { pathname, state } = useLocation();
  const preview = state?.device?.deviceId === id ? state.device : null;
  const [device, setDevice] = useState(() => cache.get(`device:${id}`) || null);
  const [forId, setForId] = useState(id);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [section, setSection] = useState(() => sectionFrom(pathname));
  const [seen, setSeen] = useState({ overview: true, apps: false, actions: false });
  const idRef = useRef(id);
  const loadGen = useRef(0);
  const refreshGen = useRef(0);
  idRef.current = id;

  if (forId !== id) {
    setForId(id);
    setDevice(cache.get(`device:${id}`) || null);
    setErr(null);
  }

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    if (!active) return;
    const next = sectionFrom(pathname);
    setSection(next);
    setSeen((prev) => (prev[next] ? prev : { ...prev, [next]: true }));
  }, [active, pathname]);

  useEffect(() => {
    let cancel = false;
    reload(id).catch((e) => {
      if (!cancel && idRef.current === id) setErr(e.message);
    });
    return () => {
      cancel = true;
    };
  }, [id]);

  async function reload(deviceId = idRef.current) {
    const token = ++loadGen.current;
    const next = await api.getDevice(deviceId);
    cache.set(`device:${deviceId}`, next);
    if (idRef.current === deviceId && loadGen.current === token) {
      setDevice(next);
      setErr(null);
    }
    return next;
  }

  /**
   * The circle waits only for the stored copy. The phone is asked afterwards,
   * and the page updates again if that measurement arrives.
   */
  function refreshFromPhone() {
    const deviceId = id;
    const token = ++refreshGen.current;
    const pending = reload(deviceId).catch((e) => {
      if (idRef.current === deviceId && refreshGen.current === token) flash(e.message, 'err');
      throw e;
    });
    pending
      .then(() => {
        if (idRef.current !== deviceId || refreshGen.current !== token) return;
        askDevice(deviceId, 'state')
          .then((answered) => {
            if (idRef.current !== deviceId || refreshGen.current !== token) return null;
            if (!answered) {
              flash('گوشی پاسخ نداد؛ آخرین وضعیت نشان داده می‌شود', 'err');
              return null;
            }
            return reload(deviceId);
          })
          .catch((e) => {
            if (idRef.current === deviceId && refreshGen.current === token) flash(e.message, 'err');
          });
      })
      .catch(() => {});
    return pending;
  }

  const shown = (device && device.deviceId === id ? device : null) || preview;

  if (!shown && err) {
    return (
      <div className="p-4">
        <div className="rounded-2xl bg-[#FCE8E6] p-4 text-sm text-danger">{err}</div>
      </div>
    );
  }

  if (!shown) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const full = device && device.deviceId === id ? device : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-outline bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight text-ink">
            {shown.label || `${shown.brand || 'نامشخص'} ${shown.model}`}
          </div>
          <div className="truncate text-xs text-muted">
            {shown.label ? `${shown.brand || 'نامشخص'} ${shown.model} · ` : ''}
            {shortId(shown.deviceId)}
          </div>
        </div>
        <StatusDot online={shown.online} withLabel />
      </header>

      <div className="relative min-h-0 flex-1">
        {!full && err && (
          <div className="p-4">
            <div className="rounded-2xl bg-[#FCE8E6] p-4 text-sm text-danger">{err}</div>
          </div>
        )}
        {!full && !err && (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}
        {full && (
          <DeviceContext.Provider value={{ device: full, reload, flash }}>
            {seen.overview && (
              <div hidden={section !== 'overview'} className="absolute inset-0 overflow-hidden">
                <SwipeRefresh className="h-full" onRefresh={refreshFromPhone}>
                  <OverviewTab />
                </SwipeRefresh>
              </div>
            )}
            {seen.apps && (
              <div hidden={section !== 'apps'} className="absolute inset-0 overflow-hidden">
                <AppsTab />
              </div>
            )}
            {seen.actions && (
              <div hidden={section !== 'actions'} className="absolute inset-0 overflow-hidden">
                <SwipeRefresh className="h-full" onRefresh={refreshFromPhone}>
                  <ActionsTab />
                </SwipeRefresh>
              </div>
            )}
          </DeviceContext.Provider>
        )}
      </div>

      <Snackbar toast={toast} />
    </div>
  );
}
