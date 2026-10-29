import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api.js';
import { cache } from '../../lib/cache.js';
import Spinner from '../../components/Spinner.jsx';
import AppRow from '../../components/AppRow.jsx';
import Tabs from '../../components/Tabs.jsx';
import SwipePager from '../../components/SwipePager.jsx';
import Icon from '../../components/Icon.jsx';
import { faDigits } from '../../lib/format.js';
import { useDevice } from './context.js';
import { askDevice } from '../../lib/deviceRefresh.js';

const TAB_KEYS = ['user', 'system', 'monitored'];

function rowsFor(tab, apps, monitored, q, labelOf) {
  const query = q.trim().toLowerCase();
  let rows;
  if (tab === 'user') rows = apps.filter((a) => !a.system);
  else if (tab === 'system') rows = apps.filter((a) => a.system);
  else rows = [...monitored].map((p) => ({ package: p, label: labelOf(p), system: false }));
  if (query) {
    rows = rows.filter(
      (a) => a.package.toLowerCase().includes(query) || (a.label || '').toLowerCase().includes(query),
    );
  }
  return rows.sort((x, y) => (x.label || x.package).localeCompare(y.label || y.package));
}

export default function AppsTab() {
  const { device, reload, flash } = useDevice();
  const id = device.deviceId;
  const [apps, setApps] = useState(() => cache.get(`apps:${id}`) || []);
  const [monitored, setMonitored] = useState(
    () => new Set(cache.get('settings')?.monitoredPackages || []),
  );
  const [tab, setTab] = useState('user');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(() => !cache.get(`apps:${id}`));
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [slide, setSlide] = useState({ progress: 0, dragging: false });
  const [forId, setForId] = useState(id);
  const idRef = useRef(id);
  const listGen = useRef(0);
  const refreshGen = useRef(0);
  idRef.current = id;

  if (forId !== id) {
    setForId(id);
    setApps(cache.get(`apps:${id}`) || []);
    setLoading(!cache.get(`apps:${id}`));
    setErr(null);
    setQ('');
    setTab('user');
  }

  useEffect(() => {
    let cancel = false;
    Promise.all([api.getApps(id), api.getSettings()])
      .then(([a, s]) => {
        if (cancel) return;
        cache.set(`apps:${id}`, a.apps || []);
        cache.set('settings', s);
        setApps(a.apps || []);
        setMonitored(new Set(s.monitoredPackages || []));
        setErr(null);
      })
      .catch((e) => {
        if (!cancel) setErr(e.message);
      })
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [id]);

  async function placeFromDb(deviceId) {
    const token = ++listGen.current;
    const [a, s] = await Promise.all([api.getApps(deviceId), api.getSettings(), reload()]);
    if (idRef.current !== deviceId || listGen.current !== token) return;
    cache.set(`apps:${deviceId}`, a.apps || []);
    cache.set('settings', s);
    setApps(a.apps || []);
    setMonitored(new Set(s.monitoredPackages || []));
    setErr(null);
    setLoading(false);
  }

  /** Stored list first, so the circle can close. A later phone scan replaces it. */
  function refresh() {
    const deviceId = id;
    const token = ++refreshGen.current;
    const pending = placeFromDb(deviceId).catch((e) => {
      if (idRef.current === deviceId && refreshGen.current === token) flash(e.message, 'err');
      throw e;
    });
    pending
      .then(() => {
        if (idRef.current !== deviceId || refreshGen.current !== token) return;
        askDevice(deviceId, 'apps')
          .then((answered) => {
            if (idRef.current !== deviceId || refreshGen.current !== token) return null;
            if (!answered) {
              flash('گوشی فهرست را نفرستاد؛ آخرین لیست نشان داده می‌شود', 'err');
              return null;
            }
            return placeFromDb(deviceId);
          })
          .catch((e) => {
            if (idRef.current === deviceId && refreshGen.current === token) flash(e.message, 'err');
          });
      })
      .catch(() => {});
    return pending;
  }

  async function toggle(pkg) {
    const previous = monitored;
    const next = new Set(previous);
    if (next.has(pkg)) next.delete(pkg);
    else next.add(pkg);
    setMonitored(next);
    setSaving(true);
    try {
      const saved = await api.updateMonitored([...next]);
      cache.set('settings', saved);
      setMonitored(new Set(saved.monitoredPackages || []));
      flash('لیست تحت رصد به‌روز شد (برای همه)');
    } catch (e) {
      setMonitored(previous);
      flash(e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  const labelOf = useMemo(() => {
    const m = new Map(apps.map((a) => [a.package, a.label]));
    return (pkg) => m.get(pkg) || pkg;
  }, [apps]);

  const counts = useMemo(
    () => ({
      user: apps.filter((a) => !a.system).length,
      system: apps.filter((a) => a.system).length,
      monitored: monitored.size,
    }),
    [apps, monitored],
  );

  const tabs = [
    { key: 'user', label: 'معمولی', count: faDigits(counts.user) },
    { key: 'system', label: 'سیستمی', count: faDigits(counts.system) },
    { key: 'monitored', label: 'تحت رصد', count: faDigits(counts.monitored) },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 bg-surface px-3 pt-3 shadow-e1">
        <div className="mb-3 flex items-center gap-3 rounded-full bg-[#EEF0F4] px-4 py-2.5">
          <Icon name="search" size={20} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="جستجوی برنامه…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          {saving && <Spinner />}
        </div>
        <Tabs
          tabs={tabs}
          value={tab}
          progress={slide.progress}
          dragging={slide.dragging}
          onChange={setTab}
        />
      </div>

      <SwipePager
        className="flex-1"
        keys={TAB_KEYS}
        value={tab}
        onChange={setTab}
        onRefresh={refresh}
        onProgress={(progress, dragging) =>
          setSlide((prev) =>
            prev.progress === progress && prev.dragging === dragging ? prev : { progress, dragging },
          )
        }
        renderPanel={(key) => {
          const list = rowsFor(key, apps, monitored, q, labelOf);
          return (
            <div className="px-4 pb-4 pt-3">
              {loading && apps.length === 0 && (
                <div className="flex justify-center py-16">
                  <Spinner />
                </div>
              )}
              {err && !apps.length && (
                <div className="rounded-2xl bg-[#FCE8E6] p-3 text-sm text-danger">خطا: {err}</div>
              )}
              {!loading && list.length === 0 && !err && (
                <div className="flex flex-col items-center gap-2 py-16 text-muted">
                  <Icon name="apps" size={36} className="text-outline" />
                  <span className="text-sm">
                    {key === 'monitored' ? 'هنوز برنامه‌ای تحت رصد نیست.' : 'برنامه‌ای یافت نشد.'}
                  </span>
                </div>
              )}
              {list.length > 0 && (
                <ul className="divide-y divide-[#F1F3F4] overflow-hidden rounded-2xl bg-surface shadow-e1">
                  {list.map((a) => (
                    <AppRow
                      key={a.package}
                      label={a.label}
                      pkg={a.package}
                      on={monitored.has(a.package)}
                      disabled={saving}
                      onToggle={() => toggle(a.package)}
                    />
                  ))}
                </ul>
              )}
              <p className="mt-3 px-2 text-center text-[11px] text-muted">
                روشن‌کردن سوییچ هر برنامه آن را به لیست «تحت رصد» اضافه می‌کند و برای همهٔ دستگاه‌ها اعمال می‌شود.
              </p>
            </div>
          );
        }}
      />
    </div>
  );
}
