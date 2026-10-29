import { useState } from 'react';
import Icon from './Icon.jsx';

/** Material card whose body collapses/expands by tapping the header. */
export default function Collapsible({ title, subtitle, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl bg-surface shadow-e1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="state-layer flex w-full items-center justify-between px-4 py-4 text-right"
      >
        <span>
          <span className="block text-sm font-bold text-ink">{title}</span>
          {subtitle && <span className="mt-0.5 block text-xs text-muted">{subtitle}</span>}
        </span>
        <Icon
          name="expand_more"
          size={22}
          className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}
