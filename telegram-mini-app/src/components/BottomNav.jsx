import { useLocation, useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

/**
 * Context-aware Material navigation bar.
 * - Inside a device (`/devices/:id...`): shows that device's sections.
 * - Elsewhere: کاربران / پورت‌ها / تنظیمات (settings only for owner).
 */
export default function BottomNav({ access }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const deviceMatch = pathname.match(/^\/devices\/([^/]+)/);
  const isOwner = access?.role === 'admin';

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
      {
        icon: 'hub',
        label: 'پورت‌ها',
        to: '/ports',
        active: pathname.startsWith('/ports'),
      },
    ];
    if (isOwner) {
      items.push({
        icon: 'settings',
        label: 'تنظیمات',
        to: '/settings',
        active: pathname.startsWith('/settings'),
      });
    }
  }

  return (
    <nav
      className="z-20 shrink-0 border-t border-outline bg-surface"
      style={{
        paddingBottom:
          'min(48px, max(0px, env(safe-area-inset-bottom), var(--tg-viewport-content-safe-area-inset-bottom, 0px)))',
      }}
    >
      <div className="mx-auto flex max-w-md">
        {items.map((it) => (
          <button
            key={it.to}
            onClick={() => navigate(it.to, { replace: true })}
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
