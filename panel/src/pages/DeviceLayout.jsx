import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Outlet } from 'react-router-dom';
import { api } from '../api.js';
import StatusDot from '../components/StatusDot.jsx';
import Spinner from '../components/Spinner.jsx';
import Snackbar from '../components/Snackbar.jsx';
import Icon from '../components/Icon.jsx';
import { shortId } from '../lib/format.js';

/**
 * Shell for a single device: shared app bar + a snackbar, with the active
 * section rendered through <Outlet>. The section buttons live in BottomNav.
 */
export default function DeviceLayout() {
  const { id } = useParams();
  const nav = useNavigate();
  const [device, setDevice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [toast, setToast] = useState(null);

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 2600);
  };

  const reload = useCallback(async () => {
    try {
      setDevice(await api.getDevice(id));
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api
      .getDevice(id)
      .then(setDevice)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }
  if (err || !device) {
    return (
      <div className="p-4">
        <button onClick={() => nav('/')} className="mb-3 text-sm text-brand-700">
          بازگشت
        </button>
        <div className="rounded-2xl bg-[#FCE8E6] p-4 text-sm text-danger">
          {err || 'دستگاه یافت نشد'}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-outline bg-surface px-2 py-3">
        <button onClick={() => nav('/')} className="state-layer rounded-full p-2" aria-label="بازگشت">
          <Icon name="arrow_forward" size={24} className="text-ink" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold leading-tight text-ink">
            {device.brand || 'نامشخص'} {device.model}
          </div>
          <div className="truncate text-xs text-muted">{shortId(device.deviceId)}</div>
        </div>
        <StatusDot online={device.online} withLabel />
      </header>

      <Outlet context={{ device, reload, flash }} />

      <Snackbar toast={toast} />
    </div>
  );
}
