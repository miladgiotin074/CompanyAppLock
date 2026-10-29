import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

/**
 * Context-aware Material navigation bar.
 * - Inside a device (`/devices/:id...`): shows that device's sections.
 * - Elsewhere: the top-level sections (کاربران / تنظیمات).
 */
export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const deviceMatch = pathname.match(/^\/devices\/([^/]+)/);

  let items;
  if (deviceMatch) {
    const id = deviceMatch[1];
    const base = `/devices/${id}`;
    items = [
      { icon: 'info', label: 'اطلاعات', to: base, active: pathname === base },
      { icon: 'apps', label: 'برنامه‌ها', to: `${base}/apps`, active: pathname.endsWith('/apps') },
      { icon: 'tune', label: 'عملیات', to: `${base}/actions`, active: pathname.endsWith('/actions') },
    ];
  } else {
    items = [
      {
        icon: 'group',
        label: 'کاربران',
        to: '/',
        active: pathname === '/' || pathname.startsWith('/devices'),
      },
      { icon: 'settings', label: 'تنظیمات', to: '/settings', active: pathname.startsWith('/settings') },
    ];
  }

  return (
    <nav
      className="sticky bottom-0 z-20 border-t border-outline bg-surface"
      style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-md">
        {items.map((it) => (
          <button
            key={it.to}
            onClick={() => navigate(it.to)}
            className="flex flex-1 flex-col items-center gap-1 pb-3 pt-3"
            aria-current={it.active ? 'page' : undefined}
          >
            <span
              className={`flex h-8 w-16 items-center justify-center rounded-full transition-colors ${
                it.active ? 'bg-tonal' : ''
              }`}
            >
              <Icon name={it.icon} fill={it.active} size={24} className={it.active ? 'text-ontonal' : 'text-muted'} />
            </span>
            <span className={`text-xs ${it.active ? 'font-bold text-ink' : 'text-muted'}`}>
              {it.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
