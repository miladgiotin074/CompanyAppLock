/** Material primary tabs with an underline indicator.
 *  - `scrollable`: horizontal scroll (variable-width tabs) instead of equal flex.
 *  - `trailing`: an extra element rendered after the tabs (e.g. an "add" button). */
export default function Tabs({ tabs, value, onChange, scrollable = false, trailing = null }) {
  return (
    <div className={`flex border-b border-outline ${scrollable ? 'no-scrollbar overflow-x-auto' : ''}`}>
      {tabs.map((t) => {
        const sel = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative py-3 text-sm transition ${
              scrollable ? 'shrink-0 px-4' : 'flex-1'
            } ${sel ? 'font-bold text-brand-700' : 'text-muted'}`}
          >
            {t.label}
            {t.count != null && ` (${t.count})`}
            {sel && (
              <span className="absolute inset-x-4 bottom-0 h-[3px] rounded-t-full bg-brand-600" />
            )}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
