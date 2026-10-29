import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backButton } from '@tma.js/sdk-react';
import { applyHeaderColor, confirmBeforeClose, expandImmediately } from '../telegram.js';

/**
 * Telegram's Back Button belongs to pushed pages (device, or port detail).
 * Root tabs کاربران / پورت‌ها / تنظیمات keep it hidden.
 */
export default function TelegramBackButton({ portsDepth = false }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const inPortDetail = pathname.startsWith('/ports') && portsDepth;
  const atRoot = !inPortDetail && (pathname === '/' || pathname.startsWith('/settings') || pathname.startsWith('/ports'));

  useEffect(() => {
    expandImmediately();
    confirmBeforeClose();
  }, []);

  useEffect(() => {
    applyHeaderColor();
  }, [pathname]);

  useEffect(() => {
    if (!backButton.isSupported()) return undefined;
    if (!backButton.isMounted()) backButton.mount();

    if (atRoot) {
      backButton.hide();
      return undefined;
    }

    const off = backButton.onClick(() => {
      if (inPortDetail) {
        window.dispatchEvent(new CustomEvent('applock:ports-back'));
        return;
      }
      navigate('/', { replace: true });
    });
    backButton.show();
    return () => off();
  }, [atRoot, pathname, navigate, inPortDetail]);

  return null;
}
