import { useState } from 'react';
import { api } from '../../api.js';
import { useDevice } from './context.js';
import Spinner from '../../components/Spinner.jsx';
import Icon from '../../components/Icon.jsx';

const ICON_STATE = { normal: 'عادی', hidden: 'مخفی', variant1: 'طرح ۱', variant2: 'طرح ۲' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function ActionsTab() {
  const { device, reload, flash } = useDevice();
  const id = device.deviceId;
  const [busy, setBusy] = useState('');
  const [iconVariant, setIconVariant] = useState('variant1');
  const [pingLabel, setPingLabel] = useState(null);

  // Poll a command until the device reports done/failed (or timeout).
  async function pollCommand(commandId, timeoutMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await sleep(600);
      const c = await api.getCommand(commandId);
      if (c.status === 'done' || c.status === 'failed') return c;
    }
    return null;
  }

  async function doPing() {
    setBusy('ping');
    setPingLabel(null);
    try {
      const r = await api.ping(id);
      if (!r.ok || !r.commandId) {
        setPingLabel('ناموفق');
        flash('ارسال پینگ ناموفق بود (FCM غیرفعال؟)', 'err');
        return;
      }
      const c = await pollCommand(r.commandId);
      if (c && c.status === 'done' && c.rttMs != null) {
        setPingLabel(`${(c.rttMs / 1000).toFixed(2)} ثانیه`);
        flash('پاسخ دریافت شد');
      } else {
        setPingLabel('بی‌پاسخ');
        flash('پاسخی از دستگاه نرسید (آفلاین/حذف‌شده؟)', 'err');
      }
      await reload();
    } catch (e) {
      setPingLabel('خطا');
      flash(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  // Icon change is confirmed by the DEVICE: we send the command, then wait for
  // the client's result. The icon state updates only on a confirmed success.
  async function runIcon(action) {
    setBusy('icon');
    try {
      const r = await api.setIcon(id, action, iconVariant);
      if (!r.ok || !r.commandId) {
        flash('ارسال دستور ناموفق بود (دستگاه آفلاین/FCM؟)', 'err');
        return;
      }
      flash('دستور ارسال شد؛ در انتظار تأیید دستگاه…');
      const c = await pollCommand(r.commandId);
      const d = await reload();
      if (c && c.status === 'done') {
        if (action === 'hide' && d?.iconState && d.iconState !== 'hidden') {
          flash('مخفی‌سازی روی این دستگاه پشتیبانی نشد؛ آیکن تغییر داده شد');
        } else {
          flash('توسط دستگاه اعمال و تأیید شد ✓');
        }
      } else {
        flash('دستگاه تأیید نکرد (آفلاین یا ناموفق)', 'err');
      }
    } catch (e) {
      flash(e.message, 'err');
    } finally {
      setBusy('');
    }
  }

  const IconBtn = ({ action, icon, label }) => (
    <button
      onClick={() => runIcon(action)}
      disabled={busy === 'icon'}
      className="state-layer flex flex-1 flex-col items-center gap-1 rounded-xl border border-outline py-2.5 text-xs font-medium text-ink disabled:opacity-50"
    >
      <Icon name={icon} size={20} className="text-brand-700" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-3">
      <section className="rounded-2xl bg-surface p-4 shadow-e1">
        <h2 className="mb-3 text-sm font-bold text-ink">پینگ</h2>
        <button
          onClick={doPing}
          disabled={busy === 'ping'}
          className="state-layer flex w-full items-center justify-center gap-2 rounded-full bg-brand-600 py-3 text-sm font-medium text-white disabled:opacity-60"
        >
          {busy === 'ping' ? (
            <>
              <Spinner className="border-white/40 border-t-white" />
              در حال اندازه‌گیری…
            </>
          ) : (
            <>
              <Icon name="network_check" size={20} />
              {pingLabel ? `پینگ: ${pingLabel}` : 'اندازه‌گیری زمان پاسخ'}
            </>
          )}
        </button>
      </section>

      <section className="rounded-2xl bg-surface p-4 shadow-e1">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">کنترل آیکن</h2>
          <span className="rounded-full bg-[#F1F3F4] px-2 py-0.5 text-xs text-muted">
            وضعیت فعلی: {ICON_STATE[device.iconState] || device.iconState}
          </span>
        </div>
        <div className="flex gap-2">
          <IconBtn action="hide" icon="visibility_off" label="مخفی" />
          <IconBtn action="change" icon="palette" label="تغییر" />
          <IconBtn action="restore" icon="visibility" label="معمولی" />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted">
          <span>طرح آیکن برای «تغییر»:</span>
          <select
            value={iconVariant}
            onChange={(e) => setIconVariant(e.target.value)}
            className="rounded-lg border border-outline bg-surface px-2 py-1 text-ink"
          >
            <option value="variant1">طرح ۱</option>
            <option value="variant2">طرح ۲</option>
          </select>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted">
          وضعیت آیکن فقط پس از دریافت «تأیید موفق» از خود دستگاه به‌روز می‌شود، نه با ارسال دستور.
          روی بعضی برندها (مثل شیائومی) مخفی‌سازی کامل ممکن نیست؛ در آن صورت به‌جای مخفی‌شدن، آیکن
          به‌طور خودکار «تغییر» می‌کند و وضعیت همان را نشان می‌دهد.
        </p>
      </section>
    </div>
  );
}
