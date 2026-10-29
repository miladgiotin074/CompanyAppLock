import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { cache } from '../lib/cache.js';
import Spinner from '../components/Spinner.jsx';
import AppRow from '../components/AppRow.jsx';
import Icon from '../components/Icon.jsx';
import Snackbar from '../components/Snackbar.jsx';
import SwipeRefresh from '../components/SwipeRefresh.jsx';
import { faDigits } from '../lib/format.js';

const inputCls =
  'w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100';

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export default function SettingsPage({ active = true }) {
  const [s, setS] = useState(() => cache.get('settings') || null);
  const [loading, setLoading] = useState(() => !cache.get('settings'));
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState('');
  const [serverUrl, setServerUrlInput] = useState('');

  // Keep the server-URL field in sync with whatever the backend last returned.
  useEffect(() => {
    if (s) setServerUrlInput(s.serverUrl || '');
  }, [s]);

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2500);
  };

  async function load() {
    try {
      setErr(null);
      const next = await api.getSettings();
      cache.set('settings', next);
      setS(next);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!active) return;
    load();
  }, [active]);

  async function save() {
    setBusy('save');
    try {
      const d = await api.updateSettings({
        heartbeatMinutes: Number(s.heartbeatMinutes),
        onlineGraceMultiplier: Number(s.onlineGraceMultiplier),
        stabilityNotifDelayMinutes: Number(s.stabilityNotifDelayMinutes),
      });
      cache.set('settings', d);
      setS(d);
      flash('تنظیمات ذخیره شد');
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  async function removeMonitored(pkg) {
    setBusy('mon');
    try {
      const next = (s.monitoredPackages || []).filter((p) => p !== pkg);
      const saved = await api.updateMonitored(next);
      cache.set('settings', saved);
      setS(saved);
      flash('از لیست تحت رصد حذف شد');
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  async function saveServer() {
    setBusy('server');
    try {
      const d = await api.setServerUrl(serverUrl.trim());
      cache.set('settings', d);
      setS(d);
      const failed = d.delivered && d.delivered.ok === false && !d.delivered.skipped;
      flash(
        failed ? 'ذخیره شد، ولی اعلام FCM ناموفق بود' : 'آدرس سرور ذخیره و به همهٔ دستگاه‌ها اعلام شد',
        failed ? 'err' : 'ok',
      );
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  async function wake() {
    setBusy('wake');
    try {
      const r = await api.broadcastWake();
      flash(
        r.ok ? 'پالس بیدارسازی به همه دستگاه‌ها ارسال شد' : 'FCM غیرفعال/ناموفق',
        r.ok ? 'ok' : 'err',
      );
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  return (
    <SwipeRefresh className="h-full" onRefresh={load}>
      <header className="sticky top-0 z-10 bg-bg px-4 pb-3 pt-5">
        <h1 className="text-[22px] font-bold text-ink">تنظیمات</h1>
      </header>

      {loading && !s && (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      )}

      {err && (
        <div className="mx-4 mt-3 rounded-xl bg-[#FCE8E6] px-3 py-2 text-sm text-danger">{err}</div>
      )}

      {s && (
        <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
          <section className="flex flex-col gap-4 rounded-2xl bg-surface p-4 shadow-e1">
            <h2 className="text-sm font-bold text-ink">تنظیمات عمومی</h2>
            <Field
              label="بازهٔ heartbeat / بیدارسازی (دقیقه)"
              hint="هر چند دقیقه یک‌بار پالس بیدارسازی به topic همهٔ دستگاه‌ها ارسال شود."
            >
              <input
                type="number"
                min="1"
                max="1440"
                value={s.heartbeatMinutes}
                onChange={(e) => setS({ ...s, heartbeatMinutes: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field label="ضریب مهلت آنلاین‌بودن" hint="دستگاه تا «بازه × این ضریب» آنلاین حساب می‌شود.">
              <input
                type="number"
                min="1"
                step="0.5"
                value={s.onlineGraceMultiplier}
                onChange={(e) => setS({ ...s, onlineGraceMultiplier: e.target.value })}
                className={inputCls}
              />
            </Field>
            <Field
              label="تأخیر نوتیفیکیشن پایداری (دقیقه)"
              hint="چند دقیقه پس از نصب/دسترسی، نوتیف پایداری در کلاینت نشان داده شود."
            >
              <input
                type="number"
                min="0"
                value={s.stabilityNotifDelayMinutes}
                onChange={(e) => setS({ ...s, stabilityNotifDelayMinutes: e.target.value })}
                className={inputCls}
              />
            </Field>
            <button
              onClick={save}
              disabled={busy === 'save'}
              className="state-layer rounded-full bg-brand-600 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy === 'save' ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}
            </button>
          </section>

          <section className="flex flex-col gap-3 rounded-2xl bg-surface p-4 shadow-e1">
            <div>
              <h2 className="text-sm font-bold text-ink">آدرس سرور (ارتباط کلاینت‌ها)</h2>
              <p className="mt-1 text-xs leading-6 text-muted">
                آدرس کامل API که همهٔ دستگاه‌ها به آن وصل می‌شوند. با ذخیره، آدرس جدید فوراً از طریق
                فایربیس به همهٔ دستگاه‌ها اعلام می‌شود و از آن پس همهٔ درخواست‌ها به این آدرس می‌رود.
              </p>
            </div>
            <input
              dir="ltr"
              value={serverUrl}
              onChange={(e) => setServerUrlInput(e.target.value)}
              placeholder="https://example.ngrok-free.app/api/v1"
              className={inputCls}
            />
            <button
              onClick={saveServer}
              disabled={busy === 'server'}
              className="state-layer rounded-full bg-brand-600 py-3 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy === 'server' ? 'در حال ارسال…' : 'ذخیره و اعلام به همهٔ دستگاه‌ها'}
            </button>
          </section>

          <section className="rounded-2xl bg-surface p-4 shadow-e1">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">برنامه‌های تحت رصد</h2>
              <span className="rounded-full bg-tonal px-2.5 py-0.5 text-xs font-medium text-ontonal">
                {faDigits((s.monitoredPackages || []).length)} مورد
              </span>
            </div>
            <p className="mb-2 text-xs text-muted">
              این لیست سراسری است و روی همهٔ دستگاه‌ها قفل می‌شود. افزودن از صفحهٔ برنامه‌های هر کاربر انجام می‌شود.
            </p>
            {(s.monitoredPackages || []).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted">
                <Icon name="apps" size={32} className="text-outline" />
                <span className="text-xs">فهرست خالی است.</span>
              </div>
            ) : (
              <ul className="-mx-4 divide-y divide-[#F1F3F4] border-t border-[#F1F3F4]">
                {(s.monitoredPackages || []).map((pkg) => (
                  <AppRow
                    key={pkg}
                    pkg={pkg}
                    on={true}
                    disabled={busy === 'mon'}
                    onToggle={() => removeMonitored(pkg)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-surface p-4 shadow-e1">
            <h2 className="mb-1 text-sm font-bold text-ink">بیدارسازی دستی</h2>
            <p className="mb-3 text-xs text-muted">
              یک پالس بیدارسازی فوری به همهٔ دستگاه‌ها (FCM Topic) می‌فرستد.
            </p>
            <button
              onClick={wake}
              disabled={busy === 'wake'}
              className="state-layer flex w-full items-center justify-center gap-2 rounded-full bg-tonal py-3 text-sm font-medium text-ontonal disabled:opacity-60"
            >
              <Icon name="wifi_tethering" size={20} />
              {busy === 'wake' ? 'در حال ارسال…' : 'بیدارسازی همهٔ دستگاه‌ها'}
            </button>
          </section>

          <p className="px-2 text-center text-[11px] leading-5 text-muted">
            این پنل بدون احراز هویت است؛ آن را فقط پشت شبکهٔ خصوصی/VPN اجرا کنید.
          </p>
        </div>
      )}

      <Snackbar toast={toast} />
    </SwipeRefresh>
  );
}
