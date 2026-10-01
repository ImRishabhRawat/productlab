import { CalendarClock, Sun } from 'lucide-react';
import { bucketStart, weekdayOf } from '@product-lab/shared/dates';
import { METRIC_COLORS, MUTED, SEQUENTIAL, SERIES } from '../../components/charts/palette.js';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { TabLinks } from '../../components/ui/Tabs.jsx';
import { DASH, fmtDate, fmtDuration, fmtNumber, formatValue } from '../../lib/format.js';
import { recordedOnly } from '../../lib/metricDisplay.js';
import { dayLabel } from '../plan/schedule.js';

const TABS = [
  { to: '/reviews/weekly', label: 'Weekly review' },
  { to: '/reviews/insights', label: 'Insights' },
];
const RECORDED = ['focusMinutes', 'outcomeSet', 'blocksCompleted', 'habitsDone'];
const BLOCKS_DONE = { key: 'blocksCompleted', label: 'Completed', color: SERIES[0] };
const BLOCKS_TODAY = { key: 'blocksToday', label: 'Open today', color: SEQUENTIAL[3] };
const BLOCKS_MISSED = { key: 'blocksOpen', label: 'Not completed', color: MUTED };

export const CORRELATION = 'Shown side by side — correlation, not cause.';

export const hoursText = (hours) => formatValue('hours', hours);
export const weekdayName = (date) => dayLabel(weekdayOf(date));
export const dayInitial = (date) => weekdayName(date).charAt(0);
export const dateLabel = (date) => fmtDate(date, { weekday: true });
export const doneLabel = (v) => (v ? 'Done' : 'Not done');
export const sumOf = (points, key) => points.reduce((sum, p) => sum + (p[key] ?? 0), 0);
export const hasProductivity = (points) => RECORDED.some((key) => sumOf(points, key) > 0);

export function asOfToday(points, today, { granularity = 'day', openToday } = {}) {
  const current = bucketStart(today, granularity);
  return recordedOnly(points, today, granularity).map((p) => {
    const open = Math.max((p.blocksScheduled ?? 0) - (p.blocksCompleted ?? 0), 0);
    if (p.key !== current) return { ...p, blocksOpen: open };
    const blocksToday = Math.min(openToday ?? open, open);
    return { ...p, blocksOpen: open - blocksToday, blocksToday };
  });
}

export const FOCUS_SERIES = [{ key: 'focusHours', label: 'Focus', color: METRIC_COLORS.focus, format: hoursText }];
export const blockSeries = (points) =>
  points.some((p) => p.blocksToday) ? [BLOCKS_DONE, BLOCKS_TODAY, BLOCKS_MISSED] : [BLOCKS_DONE, BLOCKS_MISSED];

export const countColumn = (key, header) => ({ key, header, align: 'right', format: (v) => fmtNumber(v) });
export const yesNo = (key, header) => ({ key, header, align: 'right', format: (v) => (v == null ? DASH : v ? 'Yes' : 'No') });
export const dayColumn = { key: 'key', header: 'Day', format: dateLabel };
export const focusColumn = { key: 'focusMinutes', header: 'Focus', align: 'right', format: (v) => fmtDuration(v) };
export const blockColumns = (points) => [
  countColumn('blocksScheduled', 'Scheduled'),
  ...blockSeries(points).map((s) => countColumn(s.key, s.label)),
];

export const focusProductItems = (items) =>
  items.map((p) => ({ key: p._id, label: p.name, value: p.hours, display: hoursText(p.hours), href: `/products/${p._id}` }));

export const focusProductTable = (items) => ({
  rowKey: '_id',
  rows: items,
  columns: [
    { key: 'name', header: 'Product' },
    { key: 'hours', header: 'Focus', align: 'right', format: hoursText },
  ],
});

export function ReviewHeader({ title, description }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <TabLinks className="mb-5" tabs={TABS} />
    </>
  );
}

export function ProductivityNotice({ period }) {
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <p className="text-[13px] text-body">
        <span className="font-medium text-ink">No productivity recorded {period}.</span> Log focus sessions, your #1 outcome and habits on
        Today; set up time blocks and habits in Plan.
      </p>
      <div className="flex shrink-0 gap-2">
        <ButtonLink to="/today" variant="primary" icon={Sun}>
          Today
        </ButtonLink>
        <ButtonLink to="/plan" icon={CalendarClock}>
          Plan
        </ButtonLink>
      </div>
    </Card>
  );
}
