import Icon from './Icon.jsx';

/** A Material bottom-sheet dialog centered within the mobile shell. */
export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 flex max-h-[82vh] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-e2">
        <div className="flex items-center justify-between border-b border-outline px-4 py-3">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1" aria-label="بستن">
            <Icon name="close" size={22} className="text-muted" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
