export default function StatusDot({ online, withLabel = false }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex h-2.5 w-2.5">
        {online && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
            online ? 'bg-success' : 'bg-outline'
          }`}
        />
      </span>
      {withLabel && (
        <span className={online ? 'text-success' : 'text-muted'}>
          {online ? 'آنلاین' : 'آفلاین'}
        </span>
      )}
    </span>
  );
}
