import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { SMALL_SAMPLE_PURCHASES } from '@product-lab/shared/constants';
import { daysBetween } from '@product-lab/shared/dates';
import { DateRangePicker } from '../../components/ui/DateRangePicker.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtCurrency, fmtDate, fmtRange, plural } from '../../lib/format.js';

export const MAX_COMPARE = 6;
const PURCHASE_RATIOS = ['cac', 'roas', 'conversionRate', 'aov'];
const SCOPES = [
  { value: 'all', label: 'All time' },
  { value: 'range', label: 'Date range' },
];

export const isSmallSample = (t) => Boolean(t?.spend || t?.purchases) && t.purchases < SMALL_SAMPLE_PURCHASES;
export const mutedFor = (key, t) => PURCHASE_RATIOS.includes(key) && isSmallSample(t);
export const fmtVariable = (key, value) => (key === 'price' ? fmtCurrency(value) : String(value ?? '').trim() || DASH);
export const needsStart = (startDate, today) => !startDate || startDate > today;

const startKey = (x) => x.startDate ?? String(x.createdAt ?? '').slice(0, 10);
export const byStart = (a, b) => startKey(a).localeCompare(startKey(b)) || String(a.createdAt).localeCompare(String(b.createdAt));

export function experimentDates({ startDate, endDate }) {
  if (startDate && endDate) return fmtRange({ from: startDate, to: endDate });
  return startDate ? `From ${fmtDate(startDate, { year: true })}` : 'No dates set';
}

export const durationDays = ({ status, startDate, endDate }, today) =>
  startDate && status !== 'planned' ? Math.max(daysBetween(startDate, endDate ?? today) + 1, 0) : 0;

export function experimentSpan(x, today) {
  const days = durationDays(x, today);
  return days ? `${experimentDates(x)} · ${plural(days, 'day')}` : experimentDates(x);
}

export function SmallSampleNote({ children, className = '' }) {
  return (
    <p className={`flex items-start gap-2 rounded-md bg-tint/70 px-3 py-2 text-[13px] text-body ${className}`}>
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function useScope() {
  const range = useDateRange();
  const [lifetime, setLifetime] = useState(true);
  return {
    lifetime,
    setLifetime,
    params: lifetime ? {} : { from: range.params.from, to: range.params.to },
    granularity: lifetime ? undefined : range.granularity,
    label: lifetime ? 'All time' : fmtRange(range.range),
    comparisonLabel: lifetime ? null : range.comparisonLabel,
  };
}

export function ScopeControl({ scope }) {
  const range = useDateRange();
  const choose = (value) => {
    if (value === 'range' && range.preset === 'all') range.setPreset('30d');
    scope.setLifetime(value === 'all');
  };
  return (
    <>
      <SegmentedControl label="Period" options={SCOPES} value={scope.lifetime ? 'all' : 'range'} onChange={choose} />
      {!scope.lifetime && <DateRangePicker allowAll={false} />}
    </>
  );
}
