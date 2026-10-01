import { FUNNEL_STAGES, METRICS } from '@product-lab/shared/constants';
import { bucketStart } from '@product-lab/shared/dates';
import { METRIC_COLORS, SERIES } from '../components/charts/palette.js';
import { DASH, fmtBucket, fmtCurrency, fmtMetric, fmtNumber } from './format.js';

const SHORT = {
  spend: 'Spend',
  contribution: 'Contribution',
  contributionMargin: 'Margin',
  conversionRate: 'Conv. rate',
  landingPageViews: 'Page views',
};

export const shortLabel = (key) => SHORT[key] ?? METRICS[key].label;
export const metricOptions = (keys) => keys.map((k) => ({ value: k, label: shortLabel(k) }));
export const lowerIsBetter = (key) => METRICS[key].better === 'down';
export const betterHint = (key) => (lowerIsBetter(key) ? 'Lower is better' : 'Higher is better');
export const colorFor = (key) => METRIC_COLORS[key] ?? (lowerIsBetter(key) ? SERIES[1] : SERIES[0]);
export const hasActivity = (t) => Boolean(t?.spend || t?.revenue || t?.impressions);

const UNRECORDED = Object.fromEntries(Object.keys(METRICS).map((key) => [key, null]));

export function recordedOnly(points, today, granularity = 'day') {
  const current = bucketStart(today, granularity);
  return points.map((p) => (p.key > current || (p.key === current && !hasActivity(p)) ? { ...p, ...UNRECORDED } : p));
}
export const measured = (key) => (v, x) => (x.hasData ? fmtMetric(key, v) : DASH);

export function ranked(items, key) {
  return items.filter((i) => i.hasData && i[key] != null).sort((a, b) => (lowerIsBetter(key) ? a[key] - b[key] : b[key] - a[key]));
}

export const periodColumn = (granularity, key = 'key', header = 'Period') => ({ key, header, format: (v) => fmtBucket(v, granularity, { long: true }) });
export const metricColumn = (metric, key = metric, header = shortLabel(metric)) => ({ key, header, align: 'right', format: (v) => fmtMetric(metric, v) });
export const moneyColumn = (key, header) => ({ key, header, align: 'right', format: (v) => fmtCurrency(v) });

export const seriesTable = (points, granularity, keys) => ({
  rowKey: 'key',
  rows: points,
  columns: [periodColumn(granularity), ...keys.map((k) => metricColumn(k, k, METRICS[k].label))],
});

export const funnelTable = (totals) => ({
  rowKey: 'key',
  rows: FUNNEL_STAGES.map((s) => ({ ...s, value: totals?.[s.key] })),
  columns: [
    { key: 'label', header: 'Stage' },
    { key: 'value', header: 'Count', align: 'right', format: (v) => fmtNumber(v) },
  ],
});
