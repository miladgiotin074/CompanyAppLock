import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';
import SwipeRefresh from '../components/SwipeRefresh.jsx';
import PortScreen from './PortScreen.jsx';
import { isOwner } from '../lib/panelAccess.js';
import { faDigits } from '../lib/format.js';

export default function PortsPage({ active = true, access, onDepthChange }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [openCode, setOpenCode] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const owner = isOwner(access);

  const screenOpen = creating || Boolean(openCode);
  useEffect(() => {
    onDepthChange?.(screenOpen);
  }, [screenOpen, onDepthChange]);

  useEffect(() => {
    const onBack = () => {
      setCreating(false);
      setOpenCode(null);
    };
    window.addEventListener('applock:ports-back', onBack);
    return () => window.removeEventListener('applock:ports-back', onBack);
  }, []);

  const load = useCallback(async () => {
    try {
      const body = await api.listPorts();
      setItems(body.items || []);
      setError('');
    } catch (e) {
      setError(e.message || 'خواندن پورت‌ها ممکن نشد.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  useEffect(() => {
    if (!openCode || loading) return;
    if (!items.some((p) => p.code === openCode)) setOpenCode(null);
  }, [openCode, items, loading]);

  const selected = items.find((p) => p.code === openCode) || null;

  if (screenOpen) {
    return (
      <PortScreen
        port={creating ? null : selected}
        access={access}
        onBack={() => {
          setCreating(false);
          setOpenCode(null);
        }}
        onChanged={load}
      />
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <header className="shrink-0 bg-bg px-4 pb-3 pt-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">پورت‌ها</h1>
          <span className="rounded-full bg-tonal px-3 py-1 text-xs font-medium text-ontonal">
            {faDigits(items.length)} پورت
          </span>
        </div>
      </header>
      <SwipeRefresh className="min-h-0 flex-1" onRefresh={load}>
        <div className="px-4 pb-24 pt-1">
          {error && (
            <div className="mb-3 rounded-xl bg-[#FCE8E6] px-3 py-2 text-sm text-danger">{error}</div>
          )}
          {loading && items.length === 0 && (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted">
              <Icon name="hub" size={40} className="text-outline" />
              <span className="text-sm">
                {owner
                  ? 'هنوز پورتی نیست. با دکمهٔ + یک کانال جدید بساز.'
                  : 'پورتی به شما واگذار نشده.'}
              </span>
            </div>
          )}
          <ul className="flex flex-col gap-2.5">
            {items.map((port) => (
              <li key={port.code}>
                <button
                  type="button"
                  onClick={() => setOpenCode(port.code)}
                  className="state-layer flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-right shadow-e1"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tonal">
                    <Icon name="hub" size={22} className="text-ontonal" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink">{port.name?.trim() || 'بدون اسم'}</span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] ${
                          port.groupId ? 'bg-[#E6F4EA] text-success' : 'bg-[#F1F3F4] text-muted'
                        }`}
                      >
                        {port.groupId ? 'گروه وصل' : 'بدون گروه'}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {faDigits(port.deviceCount || 0)} دستگاه
                      {port.groupTitle ? ` · ${port.groupTitle}` : ''}
                    </span>
                  </span>
                  <Icon name="chevron_left" size={22} className="shrink-0 text-outline" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SwipeRefresh>
      {owner && (
        <button
          type="button"
          aria-label="پورت جدید"
          onClick={() => {
            setCreating(true);
            setOpenCode(null);
          }}
          className="absolute bottom-4 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-e2"
        >
          <Icon name="add" size={28} />
        </button>
      )}
    </div>
  );
}
