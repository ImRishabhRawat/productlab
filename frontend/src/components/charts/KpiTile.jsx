import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { METRICS } from '@product-lab/shared/constants';
import { deltaTone, fmtDelta, fmtMetric } from '../../lib/format.js';
import { hasActivity } from '../../lib/metricDisplay.js';
import { Card } from '../ui/Card.jsx';
import { Skeleton } from '../ui/States.jsx';
import { CHART, SERIES } from './palette.js';

const TONE_CLASS = { positive: 'text-positive', negative: 'text-negative', neutral: 'text-muted' };

export function Delta({ value, better, label }) {
  if (value == null) return <span className="text-xs text-muted">{label ? 'No prior data' : ''}</span>;
  const tone = deltaTone(value, better);
  const Icon = value > 0 ? ArrowUpRight : value < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-xs whitespace-nowrap">
      <span className={`inline-flex items-center gap-0.5 font-medium ${TONE_CLASS[tone]}`}>
        <Icon className="size-3.5" aria-hidden />
        {fmtDelta(value)}
      </span>
      {label && <span className="hidden truncate text-muted @[12rem]:inline">{label}</span>}
    </span>
  );
}

export function Sparkline({ values = [], width = 88, height = 28, color = CHART.spark, accent = SERIES[0] }) {
  const points = values.map((v, i) => [i, v]).filter(([, v]) => typeof v === 'number');
  if (points.length < 2) return null;
  const ys = points.map(([, v]) => v);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const x = (i) => 2 + (i / (values.length - 1)) * (width - 4);
  const y = (v) => height - 3 - ((v - min) / (max - min || 1)) * (height - 6);
  const [lx, lv] = points.at(-1);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      <polyline
        points={points.map(([i, v]) => `${x(i)},${y(v)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(lx)} cy={y(lv)} r={2.5} fill={accent} />
    </svg>
  );
}

export function KpiTile({ metric, label, value, delta, better, spark, comparisonLabel, loading, className = '' }) {
  const meta = METRICS[metric] ?? {};
  return (
    <Card className={`@container flex min-w-0 flex-col gap-2 p-4 ${className}`}>
      <span className="truncate text-[13px] font-medium text-muted">{label ?? meta.label}</span>
      <div className="flex min-h-7 items-end justify-between gap-3">
        {loading ? (
          <Skeleton className="h-7 w-28" />
        ) : (
          <span className="truncate text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink @[12rem]:text-[26px]">
            {metric ? fmtMetric(metric, value) : value}
          </span>
        )}
        {!loading && spark && (
          <span className="hidden shrink-0 @[13rem]:block">
            <Sparkline values={spark} width={72} />
          </span>
        )}
      </div>
      <div className="flex min-h-4 min-w-0 items-center">
        {loading ? <Skeleton className="h-4 w-20" /> : <Delta value={delta} better={better === undefined ? meta.better : better} label={comparisonLabel} />}
      </div>
    </Card>
  );
}

export function KpiGrid({ keys, labels, summary, points = [], comparisonLabel, loading = summary.isPending }) {
  const current = summary.data?.current;
  const change = summary.data?.change;
  const sparks = points.length > 2 && hasActivity(current);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {keys.map((key) => (
        <KpiTile
          key={key}
          metric={key}
          label={labels?.[key]}
          value={current?.[key]}
          delta={change?.[key]}
          comparisonLabel={comparisonLabel}
          spark={sparks ? points.map((p) => p[key]) : null}
          loading={loading}
        />
      ))}
    </div>
  );
}
