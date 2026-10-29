import { useEffect, useState } from 'react';
import { api } from '../../api.js';
import Collapsible from '../../components/Collapsible.jsx';
import Icon from '../../components/Icon.jsx';
import { timeAgo, faDigits } from '../../lib/format.js';
import { useDevice } from './context.js';

const PERMS = [
  ['usage', 'دسترسی استفاده (Usage Access)'],
  ['overlay', 'نمایش روی برنامه‌ها (Overlay)'],
  ['battery', 'معافیت بهینه‌سازی باتری'],
  ['notifications', 'اعلان‌ها (Android 13+)'],
];

const INFO_LABELS = {
  manufacturer: 'سازنده',
  brand: 'برند',
  model: 'مدل',
  device: 'دستگاه',
  product: 'محصول',
  board: 'برد',
  hardware: 'سخت‌افزار',
  fingerprint: 'Fingerprint',
  display: 'بیلد نمایشگر',
  androidVersion: 'نسخه اندروید',
  sdkInt: 'SDK',
  securityPatch: 'وصلهٔ امنیتی',
  supportedAbis: 'ABIها',
  screen: 'صفحه',
  totalRamMb: 'RAM کل (MB)',
  availRamMb: 'RAM آزاد (MB)',
  totalStorageMb: 'حافظه کل (MB)',
  availStorageMb: 'حافظه آزاد (MB)',
  appVersion: 'نسخه اپ',
};
const LTR_KEYS = new Set(['fingerprint', 'supportedAbis', 'display']);

function Stat({ icon, label, value, tone = 'text-ink' }) {
  return (
    <div className="flex flex-col items-center gap-1 px-1 py-1">
      <Icon name={icon} size={20} className="text-muted" />
      <span className={`text-sm font-medium ${tone}`}>{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

export default function OverviewTab() {
  const { device, reload, flash } = useDevice();
  const info = device.info || {};
  const infoRows = Object.keys(INFO_LABELS).filter((k) => info[k] != null && info[k] !== '');

  const [label, setLabel] = useState(device.label || '');
  const [note, setNote] = useState(device.note || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setLabel(device.label || '');
    setNote(device.note || '');
  }, [device.deviceId]); // reset when navigating to another device
  const dirty = label !== (device.label || '') || note !== (device.note || '');

  async function saveAnnotation() {
    setSaving(true);
    try {
      await api.setAnnotation(device.deviceId, { label: label.trim(), note });
      await reload();
      flash('ذخیره شد');
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
      <section className="rounded-2xl bg-surface p-2 shadow-e1">
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-[#F1F3F4]">
          <Stat
            icon="shield"
            label="سرویس قفل"
            value={device.lockServiceRunning ? 'فعال' : 'خاموش'}
            tone={device.lockServiceRunning ? 'text-success' : 'text-[#B06000]'}
          />
          <Stat
            icon="network_check"
            label="آخرین پینگ"
            value={device.lastPingMs != null ? `${(device.lastPingMs / 1000).toFixed(2)}s` : '—'}
          />
          <Stat icon="schedule" label="آخرین بازدید" value={timeAgo(device.lastSeenAt)} />
        </div>
      </section>

      {device.port ? (
        <section className="rounded-2xl bg-surface px-4 py-3 shadow-e1">
          <div className="text-xs text-muted">پورت</div>
          <div className="mt-0.5 text-sm font-medium text-ink">{device.portName?.trim() || 'بدون اسم'}</div>
        </section>
      ) : null}

      {(device.wasForceStopped || device.uninstalled) && (
        <div
          className={`flex items-start gap-2 rounded-2xl p-3 text-xs ${
            device.uninstalled ? 'bg-[#FCE8E6] text-danger' : 'bg-[#FEF7E0] text-[#B06000]'
          }`}
        >
          <Icon name={device.uninstalled ? 'delete' : 'warning'} size={18} />
          <span>
            {device.uninstalled
              ? `این دستگاه اپ را حذف کرده است${device.uninstalledAt ? ` (${timeAgo(device.uninstalledAt)})` : ''}.`
              : 'این دستگاه احتمالاً force-stop شده بود؛ تا باز شدن دستی اپ، بیدارسازی از راه دور ممکن نیست.'}
          </span>
        </div>
      )}

      <Collapsible title="اطلاعات کامل دستگاه" subtitle="سخت‌افزار، صفحه، حافظه و…" defaultOpen={false}>
        <div className="flex flex-col gap-3">
          {infoRows.map((k) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted">{INFO_LABELS[k]}</span>
              <span className="break-all text-sm text-ink" dir={LTR_KEYS.has(k) ? 'ltr' : 'rtl'}>
                {k.endsWith('Mb') ? faDigits(info[k]) : String(info[k])}
              </span>
            </div>
          ))}
          {infoRows.length === 0 && (
            <span className="text-sm text-muted">اطلاعاتی دریافت نشده است.</span>
          )}
        </div>
      </Collapsible>

      <Collapsible title="دسترسی‌ها" defaultOpen={true}>
        <ul className="flex flex-col gap-3 text-sm">
          {PERMS.map(([key, label]) => {
            const ok = device.permissions?.[key];
            return (
              <li key={key} className="flex items-center justify-between">
                <span className="text-ink">{label}</span>
                <Icon
                  name={ok ? 'check_circle' : 'cancel'}
                  fill={ok}
                  size={20}
                  className={ok ? 'text-success' : 'text-outline'}
                />
              </li>
            );
          })}
        </ul>
      </Collapsible>

      <section className="rounded-2xl bg-surface p-4 shadow-e1">
        <h2 className="mb-2 text-sm font-bold text-ink">نام و توضیحات</h2>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="نام کاربر/دستگاه…"
          className="w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="توضیحات…"
          className="mt-2 w-full rounded-xl border border-outline bg-surface px-3 py-2.5 text-sm text-ink focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="button"
          onClick={saveAnnotation}
          disabled={!dirty || saving}
          className="mt-2 w-full rounded-full bg-brand-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? 'در حال ذخیره…' : 'ذخیره'}
        </button>
      </section>
    </div>
  );
}
