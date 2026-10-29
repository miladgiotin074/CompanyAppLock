import Icon from './Icon.jsx';

/** Material snackbar: dark inverse-surface pill pinned near the bottom. */
export default function Snackbar({ toast }) {
  if (!toast) return null;
  const err = toast.kind === 'err';
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[96px] z-40 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-xl bg-[#2E3132] px-4 py-3 text-sm text-white shadow-e2">
        <Icon
          name={err ? 'error' : 'check_circle'}
          size={18}
          className={err ? 'text-[#F2B8B5]' : 'text-[#7EE2A2]'}
        />
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
