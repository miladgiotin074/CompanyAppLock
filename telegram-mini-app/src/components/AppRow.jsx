/** A Material list item: name + package + an MD3 on/off switch. Shared by the
 *  device apps page and the Settings monitored list for a consistent look. */
export default function AppRow({ label, pkg, on, onToggle, disabled = false }) {
  const title = label || pkg;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{title}</div>
        {label && label !== pkg && (
          <div className="truncate text-[11px] text-muted" dir="ltr">
            {pkg}
          </div>
        )}
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        disabled={disabled}
        className={`relative h-8 w-[52px] shrink-0 rounded-full border-2 transition-colors disabled:opacity-50 ${
          on ? 'border-brand-600 bg-brand-600' : 'border-outline bg-[#E8EAED]'
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 rounded-full transition-all ${
            on ? 'left-1 h-6 w-6 bg-white' : 'right-1.5 h-4 w-4 bg-muted'
          }`}
        />
      </button>
    </li>
  );
}
