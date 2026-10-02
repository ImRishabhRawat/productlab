import { Check, ChevronLeft, ChevronRight, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { addDays, bucketStart, daysBetween, isISODate } from '@product-lab/shared/dates';
import { pctChange } from '@product-lab/shared/metrics';
import { weeklyReviewSchema } from '@product-lab/shared/schemas';
import { BarList } from '../../components/charts/BarList.jsx';
import { DayStrip } from '../../components/charts/CalendarHeatmap.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { KpiTile } from '../../components/charts/KpiTile.jsx';
import { METRIC_COLORS } from '../../components/charts/palette.js';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { FilterBar, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtDate, fmtDuration, fmtNumber, fmtRange, fmtRelative, plural } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { hasActivity, moneyColumn } from '../../lib/metricDisplay.js';
import { useGet, useMutate } from '../../lib/queries.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import {
  FOCUS_SERIES,
  ProductivityNotice,
  ReviewHeader,
  asOfToday,
  blockColumns,
  blockSeries,
  countColumn,
  dateLabel,
  dayColumn,
  dayInitial,
  doneLabel,
  focusColumn,
  focusProductItems,
  focusProductTable,
  hasProductivity,
  hoursText,
  sumOf,
  weekdayName,
  yesNo,
} from './ReviewParts.jsx';

const KPIS = ['revenue', 'spend', 'purchases', 'contribution', 'cac', 'roas'];
const NOTES = ['wins', 'lessons', 'nextFocus'];

function WeekNavigator({ weekStart, thisWeek, onChange }) {
  const current = weekStart === thisWeek;
  return (
    <FilterBar>
      <div className="flex items-center gap-1">
        <IconButton variant="secondary" icon={ChevronLeft} label="Previous week" onClick={() => onChange(addDays(weekStart, -7))} />
        <span className="min-w-32 px-2 text-center text-sm font-medium text-ink" aria-live="polite">
          Week of {fmtDate(weekStart, { year: weekStart.slice(0, 4) !== thisWeek.slice(0, 4) })}
        </span>
        <IconButton variant="secondary" icon={ChevronRight} label="Next week" disabled={current} onClick={() => onChange(addDays(weekStart, 7))} />
      </div>
      <Button disabled={current} onClick={() => onChange(thisWeek)}>
        This week
      </Button>
    </FilterBar>
  );
}

function HabitRows({ habits, dates, today }) {
  return (
    <ul className="space-y-3">
      {habits.map((h) => (
        <li key={h._id} className="flex items-center gap-3">
          <span className="min-w-0 flex-1 truncate text-[13px] text-body">{h.name}</span>
          <DayStrip
            days={dates.map((date) => ({ date, value: h.dates.includes(date) ? 1 : 0 }))}
            today={today}
            format={doneLabel}
            label={`${h.name}: ${h.done} of ${h.target} this week`}
          />
          <span className="flex w-14 items-center justify-end gap-1 text-[13px] font-medium text-ink tabular-nums">
            {h.done >= h.target && (
              <>
                <Check className="size-3.5 text-positive" aria-hidden />
                <span className="sr-only">Target met,</span>
              </>
            )}
            {h.done}/{h.target}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ExperimentsDone({ items, loading }) {
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <CardHeader title="Finished experiments" subtitle="Ended this week · open one for its results" className="mb-3" />
      {loading ? (
        <Skeleton className="h-40" />
      ) : !items.length ? (
        <EmptyState compact title="No experiments completed this week." />
      ) : (
        <ul className="-mx-2">
          {items.map((x) => (
            <li key={x._id}>
              <Link
                to={`/experiments/${x._id}`}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 hover:bg-tint/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{x.name}</span>
                  <span className="block truncate text-xs text-muted">{x.productName}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{dateLabel(x.endDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WeeklyNotes({ weekStart, review, disabled }) {
  const toast = useToast();
  const form = useForm(() => Object.fromEntries(NOTES.map((k) => [k, review?.[k] ?? ''])));
  const save = useMutate((body) => api(`/reviews/weekly/${weekStart}`, { method: 'PUT', body }));
  const saved = save.data ?? review;
  const dirty = NOTES.some((k) => form.values[k] !== (saved?.[k] ?? ''));
  const status = dirty ? 'Unsaved changes' : saved ? `Saved ${fmtRelative(saved.updatedAt)}` : 'Not written yet';

  async function onSubmit(e) {
    e.preventDefault();
    const body = form.validate(weeklyReviewSchema, form.values);
    if (!body) return;
    try {
      await save.mutateAsync(body);
      form.setValues(body);
      toast.success('Weekly review saved');
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Weekly notes"
        subtitle="Three short answers, then back to work"
        actions={<span className={`text-xs ${dirty ? 'text-ink' : 'text-muted'}`}>{status}</span>}
        className="mb-4"
      />
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={disabled} className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
          <FormField form={form} name="wins" label="Wins" as="textarea" rows={3} maxLength={1000} placeholder="What moved the numbers?" />
          <FormField
            form={form}
            name="lessons"
            label="Lessons"
            as="textarea"
            rows={3}
            maxLength={1000}
            placeholder="What would you do differently?"
          />
          <FormField
            form={form}
            name="nextFocus"
            label="Next week's focus"
            as="textarea"
            rows={3}
            maxLength={500}
            placeholder="The one thing to push next"
          />
        </fieldset>
        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            variant="primary"
            className="max-md:w-full max-md:justify-center"
            loading={save.isPending}
            disabled={disabled || !dirty}
          >
            Save review
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function WeeklyReviewPage() {
  const { today } = useDateRange();
  const search = useSearchParamState();
  const thisWeek = bucketStart(today, 'week');
  const asked = search.get('week');
  const weekStart = isISODate(asked) && asked < thisWeek ? bucketStart(asked, 'week') : thisWeek;
  const weekEnd = addDays(weekStart, 6);
  const inProgress = weekEnd > today;

  const week = useGet('/reviews/weekly', { start: weekStart });

  const data = week.data;
  const days = asOfToday(data?.productivity.points ?? [], today).map((p) => (p.key > today ? { key: p.key } : p));
  const past = days.filter((p) => p.key <= today);
  const total = (key) => sumOf(days, key);
  const focusMinutes = total('focusMinutes');
  const outcomesSet = total('outcomeSet');
  const outcomesDone = total('outcomeDone');
  const scheduled = total('blocksScheduled');
  const blocksDone = total('blocksCompleted');
  const habits = (data?.habits ?? []).map((h) => ({ ...h, target: data.habitTargets?.[h._id] ?? h.targetPerWeek }));
  const focusByProduct = data?.focusByProduct ?? [];

  const business = data?.business;
  const current = business?.current;
  const comparisonLabel = inProgress ? 'vs same days last week' : 'vs previous week';
  const state = { loading: week.isPending, fetching: week.isFetching };
  const go = (start) => search.set('week', start === thisWeek ? null : start);
  const progress = inProgress ? ` · day ${daysBetween(weekStart, today) + 1} of 7` : '';

  return (
    <>
      <ReviewHeader title="Weekly review" description={`${fmtRange({ from: weekStart, to: weekEnd })}${progress}`} />
      <WeekNavigator weekStart={weekStart} thisWeek={thisWeek} onChange={go} />

      {week.error && !data ? (
        <Card>
          <ErrorState error={week.error} onRetry={week.refetch} />
        </Card>
      ) : (
        <>
          {data && !hasProductivity(days) ? (
            <ProductivityNotice period="this week" />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChartCard
                  title="Focus hours"
                  subtitle={data ? `Last week ${hoursText(data.productivity.previous.focusHours)}` : null}
                  value={focusMinutes ? fmtDuration(focusMinutes) : null}
                  height={220}
                  {...state}
                  empty={!focusMinutes}
                  emptyMessage="No focus sessions this week."
                  emptyAction={
                    <ButtonLink to="/today" size="sm" icon={Timer}>
                      Start a focus session
                    </ButtonLink>
                  }
                  table={{ rowKey: 'key', rows: days, columns: [dayColumn, focusColumn, countColumn('sessions', 'Sessions')] }}
                >
                  <ColumnChart data={days} series={FOCUS_SERIES} xFormatter={dayInitial} tooltipLabel={dateLabel} />
                </ChartCard>
                <ChartCard
                  title="#1 outcomes"
                  subtitle="Days the #1 outcome got done"
                  value={outcomesSet ? `${fmtNumber(outcomesDone)} of ${fmtNumber(outcomesSet)}` : null}
                  height={220}
                  {...state}
                  empty={!outcomesSet}
                  emptyMessage="No #1 outcome set this week."
                  emptyAction={
                    <ButtonLink to="/today" size="sm">
                      Set today&apos;s outcome
                    </ButtonLink>
                  }
                  table={{ rowKey: 'key', rows: days, columns: [dayColumn, yesNo('outcomeSet', 'Set'), yesNo('outcomeDone', 'Done')] }}
                >
                  <div className="flex h-full flex-col items-center justify-center gap-4">
                    <DayStrip
                      days={past.map((p) => ({ date: p.key, value: p.outcomeDone }))}
                      cell={40}
                      today={today}
                      format={doneLabel}
                      label={`#1 outcome done on ${plural(outcomesDone, 'day')}`}
                    />
                    <p className="text-center text-[13px] text-muted">
                      {plural(outcomesDone, 'day')} done · {fmtNumber(outcomesSet - outcomesDone)} set but not done
                    </p>
                  </div>
                </ChartCard>
                <ChartCard
                  title="Time blocks"
                  subtitle="Completed of scheduled, per day"
                  value={scheduled ? `${fmtNumber(blocksDone)} of ${fmtNumber(scheduled)}` : null}
                  height={220}
                  {...state}
                  empty={!scheduled && !blocksDone}
                  emptyMessage="No time blocks scheduled this week."
                  emptyAction={
                    <ButtonLink to="/plan" size="sm">
                      Plan time blocks
                    </ButtonLink>
                  }
                  table={{ rowKey: 'key', rows: days, columns: [dayColumn, ...blockColumns(days)] }}
                >
                  <ColumnChart data={days} series={blockSeries(days)} stacked xFormatter={dayInitial} tooltipLabel={dateLabel} />
                </ChartCard>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Habits"
                  subtitle="Done this week against each weekly target"
                  height={null}
                  {...state}
                  empty={!habits.length}
                  emptyMessage="No habits yet."
                  emptyAction={
                    <ButtonLink to="/plan" size="sm">
                      Add habits
                    </ButtonLink>
                  }
                  table={{
                    rowKey: '_id',
                    rows: habits,
                    columns: [
                      { key: 'name', header: 'Habit' },
                      { key: 'dates', header: 'Days', format: (v) => (v.length ? v.map(weekdayName).join(', ') : DASH), sortable: false },
                      { key: 'done', header: 'Done', align: 'right', format: (v, h) => `${v}/${h.target}` },
                    ],
                  }}
                >
                  <HabitRows habits={habits} dates={past.map((p) => p.key)} today={today} />
                </ChartCard>
                <ChartCard
                  title="Focus by product"
                  subtitle="Hours logged against each product"
                  height={null}
                  {...state}
                  empty={!focusByProduct.length}
                  emptyMessage="No focus linked to a product this week."
                  table={focusProductTable(focusByProduct)}
                >
                  <BarList format="number" color={METRIC_COLORS.focus} items={focusProductItems(focusByProduct)} />
                </ChartCard>
              </div>
            </>
          )}

          <Section title="Business" description={`Sales and ad results · change ${comparisonLabel}`}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {KPIS.map((key) => (
                <KpiTile
                  key={key}
                  metric={key}
                  value={current?.[key]}
                  delta={business?.change?.[key]}
                  comparisonLabel={comparisonLabel}
                  loading={week.isPending}
                />
              ))}
              <KpiTile
                label="Experiments completed"
                value={fmtNumber(business?.experimentsCompleted)}
                delta={pctChange(business?.experimentsCompleted, business?.previousExperimentsCompleted)}
                better="up"
                comparisonLabel={business?.previousExperimentsCompleted ? comparisonLabel : null}
                loading={week.isPending}
                className="col-span-2"
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard
                className="lg:col-span-2"
                title="Revenue vs ad spend"
                subtitle="Per day"
                height={260}
                {...state}
                empty={Boolean(data) && !hasActivity(current)}
                emptyMessage="No sales or ad results this week."
                table={{
                  rowKey: 'key',
                  rows: days,
                  columns: [dayColumn, moneyColumn('revenue', 'Revenue'), moneyColumn('spend', 'Ad spend')],
                }}
              >
                <ColumnChart
                  data={days}
                  format="currency"
                  xFormatter={dayInitial}
                  tooltipLabel={dateLabel}
                  series={[
                    { key: 'revenue', label: 'Revenue', color: METRIC_COLORS.revenue },
                    { key: 'spend', label: 'Ad spend', color: METRIC_COLORS.spend },
                  ]}
                />
              </ChartCard>
              <ExperimentsDone items={business?.experiments ?? []} loading={week.isPending} />
            </div>
          </Section>

          <Section>
            {data ? (
              <WeeklyNotes key={data.weekStart} weekStart={data.weekStart} review={data.review} disabled={week.isPlaceholderData} />
            ) : (
              <Skeleton className="h-56" />
            )}
          </Section>
        </>
      )}
    </>
  );
}
