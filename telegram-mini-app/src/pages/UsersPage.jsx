import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, REFRESH_MS } from '../api.js';
import { cache } from '../lib/cache.js';
import { useAdminPrefs, isPinned, sortPinned } from '../lib/adminPrefs.js';
import { useLongPress } from '../lib/useLongPress.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';
import Tabs from '../components/Tabs.jsx';
import Modal from '../components/Modal.jsx';
import SwipePager from '../components/SwipePager.jsx';
import { timeAgo, shortId, faDigits } from '../lib/format.js';

const FILTERS = [
  { key: 'all', label: 'همه' },
  { key: 'online', label: 'آنلاین' },
  { key: 'offline', label: 'آفلاین' },
  { key: 'monitored', label: 'تحت رصد' }, // devices that have ≥1 monitored app
  { key: 'uninstalled', label: 'حذف‌شده' },
];
const MAIN_KEYS = new Set(FILTERS.map((f) => f.key));

const emptyPages = () => Object.fromEntries(FILTERS.map((f) => [f.key, 1]));

function paramsFor(filter, page, q, port) {
  const params = { page, q, limit: 50, port: port || '' };
  if (filter === 'online') {
    params.online = 'true';
    params.uninstalled = 'false';
  } else if (filter === 'offline') {
    params.online = 'false';
    params.uninstalled = 'false';
  } else if (filter === 'uninstalled') {
    params.uninstalled = 'true';
  } else if (filter === 'monitored') {
    params.monitored = 'true';
    params.uninstalled = 'false';
  } else {
    params.uninstalled = 'false';
  }
  return params;
}

function listKey(filter, page, q, port) {
  return `users:${filter}:${page}:${q}:${port || '*'}`;
}

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

const DeviceRow = memo(function DeviceRow({ d, pinned, onOpen, onLongPress }) {
  const { fired, handlers } = useLongPress(() => onLongPress(d));
  return (
    <button
      type="button"
      {...handlers}
      onClick={() => {
        if (fired.current) {
          fired.current = false;
          return;
        }
        onOpen(d);
      }}
      className="state-layer flex w-full select-none items-center gap-3 rounded-2xl bg-surface p-3 text-right shadow-e1"
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
        <div className="flex items-center gap-1.5">
          {pinned && <Icon name="push_pin" fill size={15} className="shrink-0 text-brand-600" />}
          <span className="truncate font-medium text-ink">
            {d.label || `${d.brand || 'نامشخص'} ${d.model}`}
          </span>
          {d.uninstalled && (
            <span className="shrink-0 rounded-md bg-[#FCE8E6] px-1.5 py-0.5 text-[10px] text-danger">
              حذف‌شده
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {d.label ? `${d.brand || 'نامشخص'} ${d.model} · ` : ''}
          {shortId(d.deviceId)} · اندروید {faDigits(d.androidVersion || '?')} · {timeAgo(d.lastSeenAt)}
          {d.port ? ` · ${d.portName?.trim() || 'پورت'}` : ''}
        </div>
        <div className="mt-1.5">
          <PermChips p={d.permissions} />
        </div>
      </div>
      <Icon name="chevron_left" size={22} className="shrink-0 text-outline" />
    </button>
  );
});

function UserList({ data, error, page, onPage, onOpen, onLongPress, tabKey, prefs }) {
  if (!data && !error) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  const items = sortPinned(data?.items || [], prefs, tabKey);
  const total = data?.total || 0;
  const limit = data?.limit || 50;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3">
      {error && !data && (
        <div className="rounded-2xl bg-[#FCE8E6] p-4 text-sm text-danger">خطا در ارتباط با سرور: {error}</div>
      )}
      {data && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-20 text-muted">
          <Icon name="devices_off" size={40} className="text-outline" />
          <span className="text-sm">دستگاهی یافت نشد.</span>
        </div>
      )}
      {items.map((d) => (
        <DeviceRow
          key={d.deviceId}
          d={d}
          pinned={isPinned(prefs, tabKey, d.deviceId)}
          onOpen={onOpen}
          onLongPress={onLongPress}
        />
      ))}
      {pages > 1 && (
        <div className="mt-2 flex items-center justify-center gap-3 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            className="rounded-full bg-surface px-4 py-2 text-ink shadow-e1 disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-muted">
            صفحه {faDigits(page)} از {faDigits(pages)}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            className="rounded-full bg-surface px-4 py-2 text-ink shadow-e1 disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}

function CustomPanel({ tabId, data, prefs, onOpen, onLongPress }) {
  const items = sortPinned(data?.items || [], prefs, tabId);
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4 pt-3">
      {!data && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      {data && items.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-6 py-16 text-center text-muted">
          <Icon name="group_add" size={40} className="text-outline" />
          <span className="text-sm">
            این تب خالی است. برای افزودن، روی یک کاربر (در تب‌های دیگر) نگه دارید و این تب را انتخاب کنید.
          </span>
        </div>
      )}
      {items.map((d) => (
        <DeviceRow
          key={d.deviceId}
          d={d}
          pinned={isPinned(prefs, tabId, d.deviceId)}
          onOpen={onOpen}
          onLongPress={onLongPress}
        />
      ))}
    </div>
  );
}

export default function UsersPage({ active = true, access }) {
  const nav = useNavigate();
  const admin = useAdminPrefs();
  const prefsRef = useRef(admin.prefs);
  prefsRef.current = admin.prefs;

  const owner = access?.role === 'admin';
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [port, setPort] = useState('');
  const [ports, setPorts] = useState([]);
  const [portMenu, setPortMenu] = useState(false);
  const [pageByFilter, setPageByFilter] = useState(emptyPages);
  const [lists, setLists] = useState({});
  const [errors, setErrors] = useState({});
  const [customLists, setCustomLists] = useState({});
  const [slide, setSlide] = useState({ progress: 0, dragging: false });
  const tokens = useRef({});

  // Modals
  const [addTabOpen, setAddTabOpen] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [confirmDel, setConfirmDel] = useState(null); // tabId | null
  const [menuDevice, setMenuDevice] = useState(null); // long-pressed device | null

  const customTabs = admin.prefs.customTabs;
  const keys = [...FILTERS.map((f) => f.key), ...customTabs.map((t) => t.id)];
  const tabsForBar = [
    ...FILTERS,
    ...customTabs.map((t) => ({ key: t.id, label: t.label })),
    { key: '__add__', add: true },
  ];
  const isCustom = !MAIN_KEYS.has(filter);

  useEffect(() => {
    if (!MAIN_KEYS.has(filter) && !customTabs.some((t) => t.id === filter)) setFilter('all');
  }, [filter, customTabs]);

  useEffect(() => {
    if (!owner) return undefined;
    let cancel = false;
    api
      .listPorts()
      .then((body) => {
        if (!cancel) setPorts(body.items || []);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [owner]);

  const loadOne = useCallback(async (keyFilter, page, query) => {
    const key = listKey(keyFilter, page, query, port);
    const token = {};
    tokens.current[key] = token;
    const cached = cache.get(key);
    if (cached) setLists((prev) => (prev[key] ? prev : { ...prev, [key]: cached }));
    try {
      const data = await api.listDevices(paramsFor(keyFilter, page, query, port));
      if (tokens.current[key] !== token) return;
      cache.set(key, data);
      setLists((prev) => ({ ...prev, [key]: data }));
      setErrors((prev) => ({ ...prev, [key]: null }));
    } catch (e) {
      if (tokens.current[key] !== token) return;
      setErrors((prev) => ({ ...prev, [key]: e.message }));
    }
  }, [port]);

  const loadCustom = useCallback(async (tabId) => {
    const ids = prefsRef.current.members[tabId] || [];
    const results = await Promise.all(ids.map((id) => api.getDevice(id).catch(() => null)));
    const items = results.filter((d) => d && (!port || d.port === port));
    setCustomLists((prev) => ({ ...prev, [tabId]: { items } }));
  }, [port]);

  useEffect(() => {
    for (const f of FILTERS) loadOne(f.key, pageByFilter[f.key] || 1, q);
  }, [q, pageByFilter, loadOne]);

  const activeMembersKey = isCustom ? (admin.prefs.members[filter] || []).join('|') : '';
  useEffect(() => {
    if (MAIN_KEYS.has(filter)) return;
    loadCustom(filter);
  }, [filter, activeMembersKey, loadCustom]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      if (MAIN_KEYS.has(filter)) loadOne(filter, pageByFilter[filter] || 1, q);
      else loadCustom(filter);
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, filter, pageByFilter, q, loadOne, loadCustom]);

  const headerTotal = MAIN_KEYS.has(filter)
    ? lists[listKey(filter, pageByFilter[filter] || 1, q, port)]?.total || 0
    : customLists[filter]?.items?.length ?? (admin.prefs.members[filter] || []).length;

  const openDevice = (d) => nav(`/devices/${d.deviceId}`, { state: { device: d } });
  const pinnedHere = menuDevice ? isPinned(admin.prefs, filter, menuDevice.deviceId) : false;

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 bg-bg px-4 pb-0 pt-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="relative flex min-w-0 items-center gap-1">
            <h1 className="text-2xl font-bold text-ink">کاربران</h1>
            {owner && ports.length > 0 && (
              <button
                type="button"
                onClick={() => setPortMenu((open) => !open)}
                className="flex min-w-0 items-center gap-0.5 rounded-full py-1 pe-1 ps-2 text-sm font-medium text-brand-700"
                aria-expanded={portMenu}
              >
                <span className="truncate">
                  {port ? ports.find((item) => item.code === port)?.name?.trim() || 'پورت' : 'همه'}
                </span>
                <Icon name={portMenu ? 'expand_less' : 'expand_more'} size={20} />
              </button>
            )}
            {portMenu && (
              <>
                <button
                  type="button"
                  aria-label="بستن"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setPortMenu(false)}
                />
                <div className="absolute right-0 top-full z-40 mt-2 max-h-64 w-52 overflow-y-auto rounded-2xl bg-surface py-1 shadow-e2">
                  <button
                    type="button"
                    onClick={() => {
                      setPageByFilter(emptyPages());
                      setPort('');
                      setPortMenu(false);
                    }}
                    className="flex w-full items-center justify-between px-4 py-3 text-right text-sm text-ink"
                  >
                    <span>همه پورت‌ها</span>
                    {port === '' && <Icon name="check" size={18} className="text-brand-600" />}
                  </button>
                  {ports.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => {
                        setPageByFilter(emptyPages());
                        setPort(item.code);
                        setPortMenu(false);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-right text-sm text-ink"
                    >
                      <span className="truncate">{item.name?.trim() || 'بدون اسم'}</span>
                      {port === item.code && <Icon name="check" size={18} className="shrink-0 text-brand-600" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="shrink-0 rounded-full bg-tonal px-3 py-1 text-xs font-medium text-ontonal">
            {faDigits(headerTotal)} دستگاه
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-full bg-[#EEF0F4] px-4 py-3">
          <Icon name="search" size={20} className="text-muted" />
          <input
            value={q}
            onChange={(e) => {
              setPageByFilter(emptyPages());
              setQ(e.target.value);
            }}
            placeholder="جستجوی دستگاه…"
            className="w-full bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setPageByFilter(emptyPages());
                setQ('');
              }}
              aria-label="پاک‌کردن"
            >
              <Icon name="close" size={18} className="text-muted" />
            </button>
          )}
        </div>
        <div className="-mx-4 mt-3">
          <Tabs
            scrollable
            tabs={tabsForBar}
            value={filter}
            progress={isCustom ? null : slide.progress}
            dragging={slide.dragging}
            onChange={setFilter}
            onAction={() => {
              setNewTabName('');
              setAddTabOpen(true);
            }}
            onTabLongPress={(key) => {
              if (!MAIN_KEYS.has(key)) setConfirmDel(key);
            }}
          />
        </div>
      </header>

      <SwipePager
        className="flex-1"
        keys={keys}
        value={filter}
        onChange={setFilter}
        onRefresh={() =>
          MAIN_KEYS.has(filter)
            ? Promise.all(FILTERS.map((f) => loadOne(f.key, pageByFilter[f.key] || 1, q)))
            : loadCustom(filter)
        }
        onProgress={(progress, dragging) =>
          setSlide((prev) =>
            prev.progress === progress && prev.dragging === dragging ? prev : { progress, dragging },
          )
        }
        renderPanel={(key) => {
          if (MAIN_KEYS.has(key)) {
            const page = pageByFilter[key] || 1;
            const keyId = listKey(key, page, q, port);
            return (
              <UserList
                data={lists[keyId]}
                error={errors[keyId]}
                page={page}
                tabKey={key}
                prefs={admin.prefs}
                onPage={(next) => setPageByFilter((prev) => ({ ...prev, [key]: next }))}
                onOpen={openDevice}
                onLongPress={setMenuDevice}
              />
            );
          }
          return (
            <CustomPanel
              tabId={key}
              data={customLists[key]}
              prefs={admin.prefs}
              onOpen={openDevice}
              onLongPress={setMenuDevice}
            />
          );
        }}
      />

      {/* Long-press menu: pin + add/remove from custom tabs */}
      <Modal
        open={!!menuDevice}
        onClose={() => setMenuDevice(null)}
        title={menuDevice ? `${menuDevice.brand || 'نامشخص'} ${menuDevice.model || ''}`.trim() : ''}
      >
        {menuDevice && (
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => {
                admin.togglePin(filter, menuDevice.deviceId);
                setMenuDevice(null);
              }}
              className="flex items-center gap-3 rounded-xl px-2 py-3 text-right text-sm text-ink active:bg-[#F1F3F4]"
            >
              <Icon name="push_pin" fill={pinnedHere} size={22} className={pinnedHere ? 'text-brand-600' : 'text-muted'} />
              {pinnedHere ? 'برداشتن پین از این تب' : 'پین در این تب'}
            </button>

            <div className="mt-1 border-t border-outline px-2 pt-3 text-xs text-muted">افزودن/حذف از تب‌ها</div>
            {customTabs.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">
                هنوز تبی نساخته‌اید؛ از دکمهٔ + در نوار تب‌ها بسازید.
              </p>
            ) : (
              customTabs.map((t) => {
                const inTab = (admin.prefs.members[t.id] || []).includes(menuDevice.deviceId);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      inTab
                        ? admin.removeMember(t.id, menuDevice.deviceId)
                        : admin.addMember(t.id, menuDevice.deviceId)
                    }
                    className="flex items-center gap-3 rounded-xl px-2 py-2.5 text-right text-sm text-ink active:bg-[#F1F3F4]"
                  >
                    <Icon
                      name={inTab ? 'check_box' : 'check_box_outline_blank'}
                      size={22}
                      className={inTab ? 'text-brand-600' : 'text-muted'}
                    />
                    {t.label}
                  </button>
                );
              })
            )}
          </div>
        )}
      </Modal>

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
          type="button"
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
          تب‌ها روی حساب تلگرام شما ذخیره و همگام می‌مانند.
        </p>
      </Modal>

      {/* Confirm delete tab (from a tab long-press) */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="حذف تب">
        <p className="text-sm text-ink">این تب و فهرست کاربرانش حذف شود؟ (دستگاه‌ها حذف نمی‌شوند)</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              const id = confirmDel;
              setConfirmDel(null);
              setFilter('all');
              admin.removeTab(id);
            }}
            className="flex-1 rounded-full bg-danger py-2.5 text-sm font-medium text-white"
          >
            حذف تب
          </button>
          <button
            type="button"
            onClick={() => setConfirmDel(null)}
            className="flex-1 rounded-full bg-[#F1F3F4] py-2.5 text-sm font-medium text-ink"
          >
            انصراف
          </button>
        </div>
      </Modal>
    </div>
  );
}
