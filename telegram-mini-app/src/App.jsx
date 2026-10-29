import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BottomNav from './components/BottomNav.jsx';
import TelegramBackButton from './components/TelegramBackButton.jsx';
import UsersPage from './pages/UsersPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import PortsPage from './pages/PortsPage.jsx';
import DeviceLayout from './pages/DeviceLayout.jsx';
import { api } from './api.js';
import { launchDeviceId } from './telegram.js';
import { cache } from './lib/cache.js';
import { usePanelAccess, canOpenPanel } from './lib/panelAccess.js';
import Spinner from './components/Spinner.jsx';

function deviceIdFrom(pathname) {
  const match = pathname.match(/^\/devices\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Root screens stay mounted. Switching کاربران / پورت‌ها / تنظیمات only shows the
 * screen that is already built, the same way an Android tab stack does.
 */
export default function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const access = usePanelAccess();
  const openedStart = useRef(false);
  const onSettings = pathname.startsWith('/settings');
  const onPorts = pathname.startsWith('/ports');
  const deviceId = deviceIdFrom(pathname);
  const onDevice = Boolean(deviceId);
  const onUsers = !onSettings && !onPorts && !onDevice;
  const [settingsSeen, setSettingsSeen] = useState(onSettings);
  const [portsSeen, setPortsSeen] = useState(onPorts);
  const [stickyId, setStickyId] = useState(deviceId);
  const [portsDepth, setPortsDepth] = useState(false);

  if (onSettings && !settingsSeen) setSettingsSeen(true);
  if (onPorts && !portsSeen) setPortsSeen(true);
  if (deviceId && stickyId !== deviceId) setStickyId(deviceId);

  useEffect(() => {
    if (openedStart.current) return undefined;
    openedStart.current = true;
    const id = launchDeviceId();
    if (!id || pathname !== '/') return undefined;
    navigate(`/devices/${encodeURIComponent(id)}`, { replace: true });
    return undefined;
  }, [navigate, pathname]);

  useEffect(() => {
    if (cache.get('settings')) return undefined;
    if (access.role !== 'admin') return undefined;
    let cancel = false;
    api
      .getSettings()
      .then((settings) => {
        if (!cancel) cache.set('settings', settings);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [access.role]);

  if (access.role === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <Spinner />
      </div>
    );
  }

  if (!canOpenPanel(access)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <p className="text-base font-bold text-ink">دسترسی ندارید</p>
        <p className="max-w-xs text-sm text-muted">
          این پنل فقط برای مالک یا مدیران پورت باز می‌شود.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-bg font-sans text-ink shadow-e2">
      <TelegramBackButton portsDepth={portsDepth} />
      <div className="relative min-h-0 flex-1">
        <div hidden={!onUsers} className="absolute inset-0">
          <UsersPage active={onUsers} access={access} />
        </div>
        {portsSeen && (
          <div hidden={!onPorts} className="absolute inset-0">
            <PortsPage active={onPorts} access={access} onDepthChange={setPortsDepth} />
          </div>
        )}
        {settingsSeen && access.role === 'admin' && (
          <div hidden={!onSettings} className="absolute inset-0">
            <SettingsPage active={onSettings} />
          </div>
        )}
        {stickyId && (
          <div hidden={!onDevice} className="absolute inset-0 bg-bg">
            <DeviceLayout id={stickyId} active={onDevice} />
          </div>
        )}
      </div>
      <BottomNav access={access} />
    </div>
  );
}
