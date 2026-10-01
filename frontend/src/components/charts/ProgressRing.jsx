import { CHART, SERIES, TRACK } from './palette.js';

export function ProgressRing({ value, size = 96, stroke = 8, color = SERIES[0], track = color === SERIES[0] ? TRACK : CHART.grid, label, children }) {
  const pct = value == null ? 0 : Math.min(Math.max(value, 0), 100);
  const shown = pct >= 100 ? 100 : Math.min(Math.round(pct), 99);
  const r = (size - stroke) / 2;
  const length = 2 * Math.PI * r;
  const center = size / 2;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value == null ? undefined : shown}
      aria-valuetext={value == null ? 'No data yet' : `${shown}%`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={center} cy={center} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * length} ${length}`}
            className="transition-[stroke-dasharray] duration-300"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {children ?? <span className="text-lg font-semibold text-ink tabular-nums">{value == null ? '—' : `${shown}%`}</span>}
      </div>
    </div>
  );
}
