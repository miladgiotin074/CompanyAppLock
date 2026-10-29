import { useOutletContext } from 'react-router-dom';
import Collapsible from '../../components/Collapsible.jsx';
import Icon from '../../components/Icon.jsx';
import { timeAgo, faDigits } from '../../lib/format.js';

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
  const { device } = useOutletContext();
  const info = device.info || {};
  const infoRows = Object.keys(INFO_LABELS).filter((k) => info[k] != null && info[k] !== '');

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
    </div>
  );
}
