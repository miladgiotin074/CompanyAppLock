/** Google Material Symbols (Rounded). `fill` renders the filled variant. */
export default function Icon({ name, className = '', fill = false, size = 24 }) {
  return (
    <span
      className={`material-symbols-rounded ${fill ? 'fill' : ''} ${className}`}
      style={{ fontSize: size }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
