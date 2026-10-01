import { Timer } from 'lucide-react';
import { PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { addDays, weekdayOf } from '@product-lab/shared/dates';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { METRIC_COLORS } from '../../components/charts/palette.js';
import { Button } from '../../components/ui/Button.jsx';
import { fmtCurrency, fmtDate, fmtDuration } from '../../lib/format.js';
import { moneyColumn } from '../../lib/metricDisplay.js';
import { useGet } from '../../lib/queries.js';
import { CORRELATION, FOCUS_SERIES, dayColumn, focusColumn, sumOf } from '../reviews/ReviewParts.jsx';
import { LIVE } from './useTodaySummary.js';

const REVENUE_SERIES = [{ key: 'revenue', label: 'Revenue', color: METRIC_COLORS.revenue }];
const CHARTS = [
  { key: 'focusMinutes', label: 'Focus', format: 'hours', series: FOCUS_SERIES, total: fmtDuration, empty: 'No focus sessions logged' },
  { key: 'revenue', label: 'Revenue', format: 'currency', series: REVENUE_SERIES, total: fmtCurrency, empty: 'No revenue recorded' },
];
const initial = (key) => PRODUCTIVITY_LABELS.weekday[weekdayOf(key)].charAt(0);
const dayLabel = (key) => fmtDate(key, { weekday: true });

export function WeekChart({ date, onStartFocus }) {
  const query = useGet('/productivity/series', { from: addDays(date, -6), to: date, granularity: 'day' }, LIVE);
  const points = query.data?.points ?? [];
  const totals = Object.fromEntries(CHARTS.map((c) => [c.key, sumOf(points, c.key)]));

  return (
    <ChartCard
      title="Last 7 days"
      subtitle="Focus and revenue per day"
      height={null}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.error}
      onRetry={query.refetch}
      empty={CHARTS.every((c) => !totals[c.key])}
      emptyMessage="Nothing recorded in the last 7 days."
      emptyAction={
        <Button size="sm" icon={Timer} onClick={onStartFocus}>
          Start focus
        </Button>
      }
      insight={CHARTS.every((c) => totals[c.key]) ? CORRELATION : null}
      table={{ rowKey: 'key', rows: points, columns: [dayColumn, focusColumn, moneyColumn('revenue', 'Revenue')] }}
    >
      <div className="space-y-3">
        {CHARTS.map((c) => (
          <div key={c.key}>
            <p className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="font-medium text-muted">{c.label}</span>
              <span className="font-medium text-ink tabular-nums">{c.total(totals[c.key])}</span>
            </p>
            {totals[c.key] ? (
              <div className="h-24 sm:h-28">
                <ColumnChart data={points} format={c.format} series={c.series} xFormatter={initial} tooltipLabel={dayLabel} minTickGap={4} />
              </div>
            ) : (
              <p className="rounded-md bg-tint px-3 py-2 text-xs text-muted">{c.empty}</p>
            )}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
