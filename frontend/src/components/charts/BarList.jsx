import { Link } from 'react-router';
import { DASH, formatValue } from '../../lib/format.js';
import { DIVERGING, MUTED, SERIES } from './palette.js';

export function BarList({ items, format = 'currency', color = SERIES[0], max, emptyMessage = 'No data yet.', labelWidth = '11rem' }) {
  if (!items.length) return <p className="py-6 text-center text-[13px] text-muted">{emptyMessage}</p>;
  const values = items.map((i) => (typeof i.value === 'number' ? i.value : 0));
  const diverging = values.some((v) => v < 0);
  const top = max ?? Math.max(...values.map(Math.abs), 0);
  const linked = items.some((i) => i.href);

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const v = typeof item.value === 'number' ? item.value : null;
        const pct = top > 0 && v != null ? (Math.abs(v) / top) * 100 : 0;
        const width = `${Math.max(pct, v ? 1.2 : 0) / (diverging ? 2 : 1)}%`;
        const fill = item.muted ? MUTED : v != null && v < 0 ? DIVERGING.negative : (item.color ?? color);
        const display = item.display ?? (v == null ? DASH : formatValue(format, v));
        return (
          <li
            key={item.key}
            className={`group grid items-center gap-3 rounded-sm ${linked ? 'relative max-md:min-h-8' : ''}`}
            style={{ gridTemplateColumns: `minmax(5rem, min(${labelWidth}, 40%)) minmax(0, 1fr) auto` }}
            title={`${item.label}: ${display}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-body">
              {item.prefix}
              {item.href ? (
                <Link to={item.href} className="truncate hover:text-ink hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate">{item.label}</span>
              )}
            </span>
            <div className="relative h-3">
              {diverging && <div className="absolute inset-y-[-3px] left-1/2 w-px bg-hairline" aria-hidden />}
              {v != null && (
                <div
                  className={`absolute inset-y-0 transition-[width] duration-300 group-hover:brightness-95 ${v < 0 ? 'rounded-l-[4px]' : 'rounded-r-[4px]'}`}
                  style={{
                    width,
                    backgroundColor: fill,
                    ...(diverging ? (v < 0 ? { right: '50%' } : { left: '50%' }) : { left: 0 }),
                  }}
                />
              )}
            </div>
            <span className="min-w-16 text-right text-[13px] font-medium whitespace-nowrap text-ink tabular-nums">{display}</span>
          </li>
        );
      })}
    </ul>
  );
}
