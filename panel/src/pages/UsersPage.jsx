import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, REFRESH_MS } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';
import Tabs from '../components/Tabs.jsx';
import Modal from '../components/Modal.jsx';
import { useAdminPrefs, isPinned, sortPinned } from '../lib/adminPrefs.js';
import { timeAgo, shortId, faDigits } from '../lib/format.js';

const MAIN_TABS = [
  { key: 'all', label: 'همه' },
  { key: 'online', label: 'آنلاین' },
  { key: 'offline', label: 'آفلاین' },
  { key: 'uninstalled', label: 'حذف‌شده' },
];
const MAIN_KEYS = new Set(['all', 'online', 'offline', 'uninstalled']);

function PermChips({ p }) {
  const items = [
    ['Usage', p?.usage],
    ['Overlay', p?.overlay],
    ['Battery', p?.battery],
    ['Notif', p?.notifications],
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {items.map(([label, ok]) => (
        <span
          key={label}
          className={`rounded-md px-1.5 py-0.5 text-[10px] ${
            ok ? 'bg-tonal text-ontonal' : 'bg-[#F1F3F4] text-muted'
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

export default function UsersPage() {
  const nav = useNavigate();
  const admin = useAdminPrefs();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Modals
  const [addTabOpen, setAddTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState('');
  const [pickerItems, setPickerItems] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const isCustom = !MAIN_KEYS.has(filter);
  const customTabs = admin.prefs.customTabs;
  const members = isCustom ? admin.prefs.members[filter] || [] : [];
  const membersKey = members.join('|');

  // If the active custom tab was removed, fall back to "all".
  useEffect(() => {
    if (!MAIN_KEYS.has(filter) && !customTabs.some((t) => t.id === filter)) {
      setFilter('all');
    }
  }, [filter, customTabs]);

  const load = useCallback(async () => {
    try {
      setErr(null);
      if (!MAIN_KEYS.has(filter)) {
        const ids = admin.prefs.members[filter] || [];
        const results = await Promise.all(ids.map((id) => api.getDevice(id).catch(() => null)));
        const items = results.filter(Boolean);
        setData({ items, total: items.length, limit: 1000, custom: true });
      } else {
        const params = { page, q, limit: 50 };
        if (filter === 'online') {
          params.online = 'true';
          params.uninstalled = 'false';
        } else if (filter === 'offline') {
          params.online = 'false';
          params.uninstalled = 'false';
        } else if (filter === 'uninstalled') {
          params.uninstalled = 'true';
        } else {
          params.uninstalled = 'false';
        }
        setData(await api.listDevices(params));
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page, q, membersKey]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  // Picker: fetch devices to add to the custom tab (debounced search).
  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(async () => {
      setPickerLoading(true);
      try {
        const d = await api.listDevices({ q: pickerQ, limit: 50 });
        setPickerItems(d.items || []);
      } catch {
        setPickerItems([]);
      } finally {
        setPickerLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [pickerOpen, pickerQ]);

  const rawItems = data?.items || [];
  const searched =
    isCustom && q.trim()
      ? rawItems.filter((d) =>
          `${d.brand || ''} ${d.model || ''} ${d.deviceId}`.toLowerCase().includes(q.trim().toLowerCase()),
        )
      : rawItems;
  const items = sortPinned(searched, admin.prefs, filter);
  const total = data?.total || 0;
  const limit = data?.limit || 50;
  const pages = MAIN_KEYS.has(filter) ? Math.max(1, Math.ceil(total / limit)) : 1;

  const allTabs = [...MAIN_TABS, ...customTabs.map((t) => ({ key: t.id, label: t.label }))];

  const renderRow = (d) => {
    const pinned = isPinned(admin.prefs, filter, d.deviceId);
    return (
      <div key={d.deviceId} className="flex items-center gap-1 rounded-2xl bg-surface p-2 shadow-e1">
        <button
          onClick={() => nav(`/devices/${d.deviceId}`)}
          className="state-layer flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-right"
        >
          <span className="relative shrink-0">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-tonal">
              <Icon name="smartphone" size={22} className="text-ontonal" />
            </span>
            <span
              className={`absolute bottom-0 left-0 h-3.5 w-3.5 rounded-full border-2 border-surface ${
                d.online ? 'bg-success' : 'bg-outline'
              }`}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-ink">
                {d.brand || 'نامشخص'} {d.model}
              </span>
              {d.uninstalled && (
                <span className="shrink-0 rounded-md bg-[#FCE8E6] px-1.5 py-0.5 text-[10px] text-danger">
                  حذف‌شده
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-muted">
              {shortId(d.deviceId)} · اندروید {faDigits(d.androidVersion || '?')} · {timeAgo(d.lastSeenAt)}
            </div>
            <div className="mt-1.5">
              <PermChips p={d.permissions} />
            </div>
          </div>
        </button>
        <button
          onClick={() => admin.togglePin(filter, d.deviceId)}
          className="shrink-0 rounded-full p-2 active:bg-black/5"
          aria-label={pinned ? 'برداشتن پین' : 'پین'}
        >
          <Icon name="push_pin" fill={pinned} size={20} className={pinned ? 'text-brand-600' : 'text-outline'} />
        </button>
        {isCustom && (
          <button
            onClick={() => admin.removeMember(filter, d.deviceId)}
            className="shrink-0 rounded-full p-2"
            aria-label="حذف از این تب"
          >
            <Icon name="close" size={20} className="text-muted" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-10 bg-bg px-4 pb-0 pt-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-ink">کاربران</h1>
          <span className="rounded-full bg-tonal px-3 py-1 text-xs font-medium text-ontonal">
            {faDigits(total)} دستگاه
          </span>
        </div>

        <div className="mb-3 flex items-center gap-3 rounded-full bg-[#EEF0F4] px-4 py-3">
          <Icon name="search" size={20} className="text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="جستجوی دستگاه…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="پاک‌کردن">
              <Icon name="close" size={18} className="text-muted" />
            </button>
          )}
        </div>

        <Tabs
          scrollable
          tabs={allTabs}
          value={filter}
          onChange={(k) => {
            setPage(1);
            setFilter(k);
          }}
          trailing={
            <button
              onClick={() => {
                setNewTabName('');
                setAddTabOpen(true);
              }}
              className="shrink-0 px-3 text-muted"
              aria-label="تب جدید"
            >
              <Icon name="add" size={22} />
            </button>
          }
        />
      </header>

      {isCustom && (
        <div className="flex items-center gap-2 px-4 pt-3">
          <button
            onClick={() => {
              setPickerQ('');
              setPickerItems([]);
              setPickerOpen(true);
            }}
            className="flex items-center gap-1 rounded-full bg-tonal px-3 py-1.5 text-xs font-medium text-ontonal"
          >
            <Icon name="person_add" size={16} />
            افزودن کاربر
          </button>
          <button
            onClick={() => setConfirmDel(true)}
            className="flex items-center gap-1 rounded-full bg-[#FCE8E6] px-3 py-1.5 text-xs font-medium text-danger"
          >
            <Icon name="delete" size={16} />
            حذف تب
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3">
        {loading && !data && (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        )}
        {err && (
          <div className="rounded-2xl bg-[#FCE8E6] p-4 text-sm text-danger">
            خطا در ارتباط با سرور: {err}
          </div>
        )}
        {!loading && items.length === 0 && !err && (
          <div className="flex flex-col items-center gap-2 py-20 text-muted">
            <Icon name={isCustom ? 'group_add' : 'devices_off'} size={40} className="text-outline" />
            <span className="text-sm">
              {isCustom ? 'این تب خالی است؛ با «افزودن کاربر» دستگاه اضافه کنید.' : 'دستگاهی یافت نشد.'}
            </span>
          </div>
        )}

        {items.map((d) => renderRow(d))}

        {pages > 1 && (
          <div className="mt-2 flex items-center justify-center gap-3 text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-full bg-surface px-4 py-2 text-ink shadow-e1 disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="text-muted">
              صفحه {faDigits(page)} از {faDigits(pages)}
            </span>
            <button
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-full bg-surface px-4 py-2 text-ink shadow-e1 disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        )}
      </div>

      {/* Add custom tab */}
      <Modal open={addTabOpen} onClose={() => setAddTabOpen(false)} title="تب جدید">
        <input
          value={newTabName}
          onChange={(e) => setNewTabName(e.target.value)}
          placeholder="نام تب…"
          autoFocus
          className="w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          onClick={() => {
            const name = newTabName.trim();
            if (!name) return;
            const id = admin.addTab(name);
            setAddTabOpen(false);
            setFilter(id);
          }}
          disabled={!newTabName.trim()}
          className="mt-3 w-full rounded-full bg-brand-600 py-3 text-sm font-medium text-white disabled:opacity-50"
        >
          افزودن تب
        </button>
        <p className="mt-2 text-center text-[11px] text-muted">
          تب‌ها فقط برای شما در این مرورگر ذخیره می‌شوند.
        </p>
      </Modal>

      {/* Confirm delete tab */}
      <Modal open={confirmDel} onClose={() => setConfirmDel(false)} title="حذف تب">
        <p className="text-sm text-ink">این تب و فهرست کاربران داخلش حذف شود؟ (دستگاه‌ها حذف نمی‌شوند)</p>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => {
              const id = filter;
              setConfirmDel(false);
              setFilter('all');
              admin.removeTab(id);
            }}
            className="flex-1 rounded-full bg-danger py-2.5 text-sm font-medium text-white"
          >
            حذف تب
          </button>
          <button
            onClick={() => setConfirmDel(false)}
            className="flex-1 rounded-full bg-[#F1F3F4] py-2.5 text-sm font-medium text-ink"
          >
            انصراف
          </button>
        </div>
      </Modal>

      {/* Add members to custom tab */}
      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="افزودن کاربر به تب">
        <div className="mb-3 flex items-center gap-2 rounded-full bg-[#EEF0F4] px-4 py-2.5">
          <Icon name="search" size={20} className="text-muted" />
          <input
            value={pickerQ}
            onChange={(e) => setPickerQ(e.target.value)}
            placeholder="جستجوی دستگاه…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
        </div>
        {pickerLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {!pickerLoading && pickerItems.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">دستگاهی یافت نشد.</div>
        )}
        <ul className="divide-y divide-[#F1F3F4]">
          {pickerItems.map((d) => {
            const inTab = (admin.prefs.members[filter] || []).includes(d.deviceId);
            return (
              <li key={d.deviceId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">
                    {d.brand || 'نامشخص'} {d.model}
                  </div>
                  <div className="truncate text-[11px] text-muted" dir="ltr">
                    {shortId(d.deviceId)}
                  </div>
                </div>
                <button
                  onClick={() =>
                    inTab ? admin.removeMember(filter, d.deviceId) : admin.addMember(filter, d.deviceId)
                  }
                  className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${
                    inTab ? 'bg-[#E6F4EA] text-success' : 'bg-tonal text-ontonal'
                  }`}
                >
                  <Icon name={inTab ? 'check' : 'add'} size={16} />
                  {inTab ? 'در تب' : 'افزودن'}
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    </div>
  );
}
