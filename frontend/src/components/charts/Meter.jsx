import { CHART, MUTED, SERIES, STATUS, TRACK } from './palette.js';

const FILLS = { default: SERIES[0], good: STATUS.good, warning: STATUS.warning, critical: STATUS.critical, muted: MUTED };

export function Meter({ value, max, tone = 'default', marker, label, valueLabel, height = 8 }) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.min(Math.max((value ?? 0) / safeMax, 0), 1) * 100;
  const markerPct = marker ? Math.min(Math.max(marker.value / safeMax, 0), 1) * 100 : null;
  return (
    <div>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-body">{label}</span>
          <span className="font-medium whitespace-nowrap text-ink tabular-nums">{valueLabel}</span>
        </div>
      )}
      <div
        role="meter"
        aria-label={typeof label === 'string' ? label : undefined}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={value ?? 0}
        className="relative rounded-full"
        style={{ height, backgroundColor: tone === 'default' ? TRACK : CHART.grid }}
      >
        <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, backgroundColor: FILLS[tone] }} />
        {markerPct != null && (
          <div className="absolute -top-1 -bottom-1 w-0.5 rounded-full bg-ink" style={{ left: `calc(${markerPct}% - 1px)` }} aria-hidden />
        )}
      </div>
      {marker?.label && (
        <div className="relative mt-1 h-4 text-[11px] text-muted">
          <span
            className="absolute whitespace-nowrap"
            style={markerPct > 70 ? { right: `${100 - markerPct}%` } : { left: `${markerPct}%`, transform: markerPct > 15 ? 'translateX(-50%)' : undefined }}
          >
            {marker.label}
          </span>
        </div>
      )}
    </div>
  );
}

export function ScoreBar({ label, value, max = 10, invert = false, note }) {
  const filled = typeof value === 'number' ? Math.round(value) : 0;
  const color = invert ? (value >= 7 ? STATUS.critical : value >= 4 ? STATUS.warning : STATUS.good) : SERIES[0];
  return (
    <div className="grid grid-cols-[minmax(7rem,11rem)_minmax(0,1fr)_2.75rem] items-center gap-3" title={note || undefined}>
      <span className="truncate text-[13px] text-body">{label}</span>
      <div className="flex gap-0.5" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value ?? 0}>
        {Array.from({ length: max }, (_, i) => (
          <span key={i} className="h-2.5 flex-1 rounded-[2px]" style={{ backgroundColor: i < filled ? color : CHART.grid }} />
        ))}
      </div>
      <span className="text-right text-[13px] font-medium text-ink tabular-nums">
        {typeof value === 'number' ? `${Number.isInteger(value) ? value : value.toFixed(1)}` : '—'}
        <span className="text-faint">/{max}</span>
      </span>
    </div>
  );
}
