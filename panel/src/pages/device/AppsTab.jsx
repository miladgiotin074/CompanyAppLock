import { useEffect, useMemo, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import Spinner from '../../components/Spinner.jsx';
import AppRow from '../../components/AppRow.jsx';
import Tabs from '../../components/Tabs.jsx';
import Icon from '../../components/Icon.jsx';
import { faDigits } from '../../lib/format.js';

export default function AppsTab() {
  const { device, flash } = useOutletContext();
  const id = device.deviceId;
  const [apps, setApps] = useState([]);
  const [monitored, setMonitored] = useState(() => new Set());
  const [tab, setTab] = useState('user');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const [a, s] = await Promise.all([api.getApps(id), api.getSettings()]);
      setApps(a.apps || []);
      setMonitored(new Set(s.monitoredPackages || []));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  async function toggle(pkg) {
    const next = new Set(monitored);
    next.has(pkg) ? next.delete(pkg) : next.add(pkg);
    setMonitored(next);
    setSaving(true);
    try {
      await api.updateMonitored([...next]);
      flash('لیست تحت رصد به‌روز شد (برای همه)');
    } catch (e) {
      setMonitored(monitored);
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

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    let rows;
    if (tab === 'user') rows = apps.filter((a) => !a.system);
    else if (tab === 'system') rows = apps.filter((a) => a.system);
    else rows = [...monitored].map((p) => ({ package: p, label: labelOf(p), system: false }));
    if (query) {
      rows = rows.filter(
        (a) =>
          a.package.toLowerCase().includes(query) ||
          (a.label || '').toLowerCase().includes(query),
      );
    }
    return rows.sort((x, y) => (x.label || x.package).localeCompare(y.label || y.package));
  }, [apps, monitored, tab, q, labelOf]);

  const TABS = [
    { key: 'user', label: 'معمولی', count: faDigits(counts.user) },
    { key: 'system', label: 'سیستمی', count: faDigits(counts.system) },
    { key: 'monitored', label: 'تحت رصد', count: faDigits(counts.monitored) },
  ];

  return (
    <div className="flex flex-col">
      <div className="bg-surface px-3 pb-0 pt-3 shadow-e1">
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
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      <div className="px-4 pb-4 pt-3">
        {loading && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {err && <div className="rounded-2xl bg-[#FCE8E6] p-3 text-sm text-danger">خطا: {err}</div>}

        {!loading && list.length === 0 && !err && (
          <div className="flex flex-col items-center gap-2 py-16 text-muted">
            <Icon name="apps" size={36} className="text-outline" />
            <span className="text-sm">
              {tab === 'monitored' ? 'هنوز برنامه‌ای تحت رصد نیست.' : 'برنامه‌ای یافت نشد.'}
            </span>
          </div>
        )}

        {!loading && list.length > 0 && (
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
    </div>
  );
}
