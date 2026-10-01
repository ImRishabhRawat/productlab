import { statusMeta } from '../../lib/status.js';

export function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-xs font-medium whitespace-nowrap text-body ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ kind = 'status', value, label, className = '' }) {
  if (!value) return null;
  const meta = statusMeta(kind, value);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink ${className}`}
      style={{ backgroundColor: `${meta.color}1f` }}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
      {label ?? meta.label}
    </span>
  );
}

export function Dot({ color, className = '' }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} aria-hidden />;
}
