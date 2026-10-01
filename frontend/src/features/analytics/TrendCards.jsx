import { useState } from 'react';
import { LABELS, METRICS } from '@product-lab/shared/constants';
import { addDays, bucketStart, daysBetween, nextBucket } from '@product-lab/shared/dates';
import { addTotals, deriveMetrics, emptyTotals } from '@product-lab/shared/metrics';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Delta } from '../../components/charts/KpiTile.jsx';
import { MUTED } from '../../components/charts/palette.js';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { fmtMetric, fmtRange } from '../../lib/format.js';
import { colorFor, hasActivity, metricColumn, metricOptions, periodColumn } from '../../lib/metricDisplay.js';

const EXPLORER = ['revenue', 'spend', 'contribution', 'purchases', 'cac', 'roas', 'aov', 'conversionRate', 'ctr', 'cpc', 'cpm'];

function alignPrevious(current, previous) {
  if (!current || !previous || addDays(previous.to, 1) !== current.from) return null;
  const shift = daysBetween(previous.from, current.from);
  const sums = new Map();
  for (const p of previous.points) {
    const key = bucketStart(addDays(p.key, shift), current.granularity);
    sums.set(key, addTotals(sums.get(key) ?? emptyTotals(), p));
  }
  return current.points.map((p) => {
    const from = p.key > current.from ? p.key : current.from;
    const to = addDays(nextBucket(p.key, current.granularity), -1);
    return {
      span: { from: addDays(from, -shift), to: addDays(to < current.to ? to : current.to, -shift) },
      totals: sums.has(p.key) ? deriveMetrics(sums.get(p.key)) : null,
    };
  });
}

function MetricChart({ data, ...props }) {
  return data.length === 1 ? <ColumnChart data={data} {...props} /> : <TrendChart data={data} {...props} />;
}

function MetricValue({ metric, totals: { current, change } }) {
  return (
    <>
      {fmtMetric(metric, current[metric])}
      <div className="font-normal">
        <Delta value={change?.[metric]} better={METRICS[metric].better} />
      </div>
    </>
  );
}

export function MetricExplorer({ series, prevSeries, summary, granularity, comparisonLabel }) {
  const [metric, setMetric] = useState('revenue');
  const points = series.data?.points ?? [];
  const aligned = alignPrevious(series.data, prevSeries?.data);
  const compare = Boolean(aligned?.some((a) => hasActivity(a.totals)));
  const label = METRICS[metric].label;
  const data = points.map((p, i) => ({
    key: p.key,
    current: p[metric],
    span: aligned?.[i].span,
    previous: compare ? (aligned[i].totals?.[metric] ?? null) : null,
  }));
  const lines = [
    { key: 'current', label: compare ? 'This period' : label, color: colorFor(metric) },
    ...(compare
      ? [{ key: 'previous', label: 'Previous period', color: MUTED, format: (v, row) => `${fmtMetric(metric, v)} · ${fmtRange(row.span)}` }]
      : []),
  ];

  return (
    <ChartCard
      className="mt-4"
      title={label}
      subtitle={compare ? `${LABELS.granularity[granularity]} · ${comparisonLabel}` : LABELS.granularity[granularity]}
      value={summary.data && <MetricValue metric={metric} totals={summary.data} />}
      height={300}
      loading={series.isPending || prevSeries?.isPending}
      fetching={series.isFetching || prevSeries?.isFetching}
      error={series.error ?? prevSeries?.error}
      onRetry={() => (series.error ? series.refetch() : prevSeries.refetch())}
      toolbar={<SegmentedControl size="sm" label="Metric" options={metricOptions(EXPLORER)} value={metric} onChange={setMetric} />}
      table={{
        rowKey: 'key',
        rows: data,
        columns: [
          periodColumn(granularity),
          metricColumn(metric, 'current', lines[0].label),
          ...(compare
            ? [
                { key: 'span', header: 'Previous period', format: (v) => fmtRange(v), sortValue: (r) => r.span.from },
                metricColumn(metric, 'previous', 'Previous value'),
              ]
            : []),
        ],
      }}
    >
      <MetricChart data={data} granularity={granularity} format={METRICS[metric].format} series={lines} />
    </ChartCard>
  );
}

export function RateCard({ metric, note, points, granularity, summary, state, height }) {
  const label = METRICS[metric].label;
  const previous = summary.data?.previous?.[metric];
  return (
    <ChartCard
      title={label}
      subtitle={note}
      value={summary.data && <MetricValue metric={metric} totals={summary.data} />}
      height={height}
      {...state}
      table={{ rowKey: 'key', rows: points, columns: [periodColumn(granularity), metricColumn(metric, metric, label)] }}
    >
      <MetricChart
        data={points}
        granularity={granularity}
        format={METRICS[metric].format}
        series={[{ key: metric, label, color: colorFor(metric) }]}
        reference={previous != null ? { value: previous } : undefined}
      />
    </ChartCard>
  );
}
