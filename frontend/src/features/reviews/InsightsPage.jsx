import { ChevronDown, ChevronUp, Timer } from 'lucide-react';
import { bucketStart, daysBetween } from '@product-lab/shared/dates';
import { percent } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { CalendarHeatmap } from '../../components/charts/CalendarHeatmap.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Legend } from '../../components/charts/Legend.jsx';
import { CHART, METRIC_COLORS, SERIES, sequentialColor } from '../../components/charts/palette.js';
import { ScatterPlot } from '../../components/charts/ScatterPlot.jsx';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { Dot } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DateRangePicker, GranularityControl } from '../../components/ui/DateRangePicker.jsx';
import { FilterBar, Section } from '../../components/ui/PageHeader.jsx';
import { ErrorState } from '../../components/ui/States.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtCurrency, fmtDate, fmtDuration, fmtNumber, fmtPercent, fmtRange, plural } from '../../lib/format.js';
import { moneyColumn, periodColumn, seriesTable } from '../../lib/metricDisplay.js';
import { useGet } from '../../lib/queries.js';
import { useMediaQuery } from '../../lib/useMediaQuery.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { blockColor, categoryLabel } from '../plan/schedule.js';
import {
  CORRELATION,
  FOCUS_SERIES,
  ProductivityNotice,
  ReviewHeader,
  asOfToday,
  blockColumns,
  blockSeries,
  countColumn,
  dayColumn,
  focusColumn,
  focusProductItems,
  focusProductTable,
  hasProductivity,
  hoursText,
  sumOf,
  yesNo,
} from './ReviewParts.jsx';

const PER = { day: 'Per day', week: 'Per week', month: 'Per month' };
const PAIR_HEIGHT = 170;
const ROW_HEIGHT = PAIR_HEIGHT * 2 + 52;
const OUTCOME_STATES = ['No outcome', 'Set, not done', 'Done'];
const OUTCOME_LEGEND = [
  { key: 'done', label: 'Done', color: sequentialColor(2, 2) },
  { key: 'set', label: 'Set, not done', color: sequentialColor(1, 2) },
  { key: 'none', label: 'No outcome', color: CHART.grid },
];

const queryState = (q) => ({ loading: q.isPending, fetching: q.isFetching, error: q.error, onRetry: q.refetch });
const heatCell = (weeks) => Math.min(26, Math.max(12, Math.floor(280 / weeks) - 2));

function Aligned({ label, total, children }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-muted">{label}</span>
        <span className="font-medium text-ink tabular-nums">{total}</span>
      </div>
      <div style={{ height: PAIR_HEIGHT }}>{children}</div>
    </div>
  );
}

const focusAction = (
  <ButtonLink to="/today" size="sm" icon={Timer}>
    Start a focus session
  </ButtonLink>
);

const planAction = (label) => (
  <ButtonLink to="/plan" size="sm">
    {label}
  </ButtonLink>
);

export default function InsightsPage() {
  const range = useDateRange();
  const mobile = useMediaQuery('(max-width: 767px)');
  const search = useSearchParamState();
  const expanded = search.get('charts') === 'all';
  const details = !mobile || expanded;
  const { today } = range;
  const { from, to } = range.params;
  const series = useGet('/productivity/series', range.params);
  const weekly = useGet('/productivity/series', { from, to, granularity: 'week' }, { enabled: details });
  const daily = useGet('/productivity/series', { from, to, granularity: 'day' });

  const data = series.data;
  const granularity = data?.granularity ?? range.granularity;
  const per = PER[granularity];
  const days = daily.data?.granularity === 'day' ? asOfToday(daily.data.points, today) : [];
  const openToday = days.find((p) => p.key === today)?.blocksToday ?? 0;
  const points = asOfToday(data?.points ?? [], today, { granularity, openToday });
  const total = (key) => sumOf(points, key);
  const focusMinutes = total('focusMinutes');
  const scheduled = total('blocksScheduled');
  const blocksDone = total('blocksCompleted');
  const habitsPossible = total('habitsPossible');
  const focusByProduct = data?.focusByProduct ?? [];
  const focusByCategory = data?.focusByCategory ?? [];

  const first = days.findIndex((p) => p.sessions || p.outcomeSet || p.habitsDone || p.blocksCompleted);
  const tracked = first < 0 ? [] : days.slice(first).filter((p) => p.revenue != null).map((p) => ({ ...p, name: fmtDate(p.key) }));
  const outcomesSet = sumOf(days, 'outcomeSet');
  const outcomesDone = sumOf(days, 'outcomeDone');
  const habitCount = Math.max(0, ...days.map((p) => p.habitsPossible));
  const weeks = daily.data ? Math.floor(daysBetween(bucketStart(daily.data.from, 'week'), daily.data.to) / 7) + 1 : 1;
  const calendar = daily.data && { from: daily.data.from, to: daily.data.to, cell: heatCell(weeks) };
  const weekPoints = weekly.data?.points ?? [];
  const experimentsDone = sumOf(weekPoints, 'experimentsCompleted');

  const state = queryState(series);
  const dailyState = queryState(daily);
  const notice = data && !hasProductivity(points);
  const Chevron = expanded ? ChevronUp : ChevronDown;

  const scatter = (
    <ChartCard
      title="Daily focus vs revenue"
      subtitle="Each dot is a day since tracking began"
      height={ROW_HEIGHT}
      {...dailyState}
      empty={!tracked.length}
      emptyMessage="No tracked days in this period."
      insight={CORRELATION}
      table={{ rowKey: 'key', rows: tracked, columns: [dayColumn, focusColumn, moneyColumn('revenue', 'Revenue')] }}
    >
      <ScatterPlot
        data={tracked}
        x={{ key: 'focusMinutes', label: 'Focus minutes', format: 'number' }}
        y={{ key: 'revenue', label: 'Revenue', format: 'currency' }}
        labelCount={3}
        extraRows={(p) => [{ label: 'Focus', value: fmtDuration(p.focusMinutes) }]}
      />
    </ChartCard>
  );

  const outcomes = (
    <ChartCard
      title="#1 outcomes"
      subtitle="Each square is a day"
      value={outcomesSet ? `${fmtNumber(outcomesDone)} of ${fmtNumber(outcomesSet)}` : null}
      height={null}
      {...dailyState}
      empty={!outcomesSet}
      emptyMessage="No #1 outcomes set in this period."
      emptyAction={
        <ButtonLink to="/today" size="sm">
          Set today&apos;s outcome
        </ButtonLink>
      }
      insight={outcomesSet ? `Done on ${fmtPercent(percent(outcomesDone, outcomesSet), 0)} of the days one was set.` : null}
      table={{ rowKey: 'key', rows: days, columns: [dayColumn, yesNo('outcomeSet', 'Set'), yesNo('outcomeDone', 'Done')] }}
    >
      <Legend className="mb-3" items={OUTCOME_LEGEND} />
      {calendar && (
        <CalendarHeatmap
          {...calendar}
          values={Object.fromEntries(days.map((p) => [p.key, p.outcomeSet + p.outcomeDone]))}
          max={2}
          format={(v) => OUTCOME_STATES[v]}
          label="#1 outcome per day"
        />
      )}
    </ChartCard>
  );

  return (
    <>
      <ReviewHeader title="Insights" description={`Is time turning into output? · ${fmtRange(data ?? range.range)}`} />
      <FilterBar>
        <DateRangePicker />
        <GranularityControl />
      </FilterBar>

      {series.error && !data ? (
        <Card>
          <ErrorState error={series.error} onRetry={series.refetch} />
        </Card>
      ) : (
        <>
          {notice ? (
            <ProductivityNotice period="in this period" />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChartCard
                className="lg:col-span-2"
                title="Focus hours and revenue"
                subtitle={`${per} · same dates, separate scales`}
                height={ROW_HEIGHT}
                {...state}
                empty={!focusMinutes}
                emptyMessage="No focus sessions in this period."
                emptyAction={focusAction}
                insight={CORRELATION}
                table={{
                  rowKey: 'key',
                  rows: points,
                  columns: [periodColumn(granularity), focusColumn, moneyColumn('revenue', 'Revenue')],
                }}
              >
                <div className="space-y-3">
                  <Aligned label="Focus hours" total={fmtDuration(focusMinutes)}>
                    <ColumnChart data={points} granularity={granularity} series={FOCUS_SERIES} />
                  </Aligned>
                  <Aligned label="Revenue" total={fmtCurrency(total('revenue'))}>
                    <ColumnChart
                      data={points}
                      granularity={granularity}
                      format="currency"
                      series={[{ key: 'revenue', label: 'Revenue', color: METRIC_COLORS.revenue }]}
                    />
                  </Aligned>
                </div>
              </ChartCard>
              {mobile ? outcomes : scatter}
            </div>
          )}

          {mobile && (
            <Button
              className="mt-4 w-full justify-center"
              aria-expanded={expanded}
              aria-controls="insights-details"
              onClick={() => search.set('charts', expanded ? null : 'all')}
            >
              {expanded ? 'Fewer charts' : 'More charts'}
              <Chevron className="size-4" aria-hidden />
            </Button>
          )}

          <div id="insights-details">
            {details && (
              <>
                {!notice && (
                  <>
                    {mobile && <div className="mt-4">{scatter}</div>}
                    <Section title="Follow-through" description="Did the #1 outcome and the habits actually happen?">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        {!mobile && outcomes}
                        <ChartCard
                          title="Habit consistency"
                          subtitle="Darker days had more habits done"
                          height={null}
                          {...dailyState}
                          empty={!habitCount}
                          emptyMessage="No habit check-ins in this period."
                          emptyAction={planAction('Add habits')}
                          table={{
                            rowKey: 'key',
                            rows: days,
                            columns: [dayColumn, countColumn('habitsDone', 'Done'), countColumn('habitsPossible', 'Due')],
                          }}
                        >
                          {calendar && (
                            <CalendarHeatmap
                              {...calendar}
                              values={Object.fromEntries(days.map((p) => [p.key, p.habitsDone]))}
                              max={habitCount}
                              format={(v) => `${plural(v, 'habit')} done`}
                              label="Habits done per day"
                            />
                          )}
                        </ChartCard>
                        <ChartCard
                          title="Habit completion"
                          subtitle={`${per} · against weekly targets`}
                          value={habitsPossible ? fmtPercent(percent(total('habitsDone'), habitsPossible), 0) : null}
                          height={240}
                          {...state}
                          empty={!habitsPossible}
                          emptyMessage="No habit check-ins in this period."
                          emptyAction={planAction('Add habits')}
                          table={{
                            rowKey: 'key',
                            rows: points,
                            columns: [
                              periodColumn(granularity),
                              countColumn('habitsDone', 'Done'),
                              countColumn('habitsPossible', 'Due'),
                              { key: 'habitRate', header: 'Rate', align: 'right', format: (v) => fmtPercent(v, 0) },
                            ],
                          }}
                        >
                          <ColumnChart
                            data={points}
                            granularity={granularity}
                            format="percent"
                            yDomain={[0, 100]}
                            series={[{ key: 'habitRate', label: 'Habits done', color: SERIES[0] }]}
                          />
                        </ChartCard>
                      </div>
                    </Section>

                    <Section title="Where the time went" description="Scheduled blocks, and focus hours by product and by kind of work">
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                        <ChartCard
                          title="Time blocks"
                          subtitle={`${per} · completed of scheduled`}
                          value={scheduled ? `${fmtNumber(blocksDone)} of ${fmtNumber(scheduled)}` : null}
                          height={240}
                          {...state}
                          loading={series.isPending || daily.isPending}
                          empty={!scheduled && !blocksDone}
                          emptyMessage="No time blocks scheduled."
                          emptyAction={planAction('Plan time blocks')}
                          table={{ rowKey: 'key', rows: points, columns: [periodColumn(granularity), ...blockColumns(points)] }}
                        >
                          <ColumnChart data={points} granularity={granularity} series={blockSeries(points)} stacked />
                        </ChartCard>
                        <ChartCard
                          title="Focus by product"
                          subtitle="Hours logged against each product"
                          height={null}
                          {...state}
                          empty={!focusByProduct.length}
                          emptyMessage="No focus linked to a product."
                          emptyAction={focusAction}
                          table={focusProductTable(focusByProduct)}
                        >
                          <BarList format="number" color={METRIC_COLORS.focus} items={focusProductItems(focusByProduct)} />
                        </ChartCard>
                        <ChartCard
                          title="Focus by category"
                          subtitle="Hours by kind of work"
                          height={null}
                          {...state}
                          empty={!focusByCategory.length}
                          emptyMessage="No focus sessions in this period."
                          emptyAction={focusAction}
                          table={{
                            rowKey: 'category',
                            rows: focusByCategory,
                            columns: [
                              { key: 'category', header: 'Category', format: categoryLabel },
                              { key: 'hours', header: 'Focus', align: 'right', format: hoursText },
                            ],
                          }}
                        >
                          <BarList
                            format="number"
                            labelWidth="8rem"
                            color={METRIC_COLORS.focus}
                            items={focusByCategory.map((c) => ({
                              key: c.category,
                              label: categoryLabel(c.category),
                              value: c.hours,
                              display: hoursText(c.hours),
                              prefix: <Dot color={blockColor(c.category)} />,
                            }))}
                          />
                        </ChartCard>
                      </div>
                    </Section>
                  </>
                )}

                <Section title="Business output" description="Sales, ad results and finished experiments">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <ChartCard
                      className="lg:col-span-2"
                      title="Ad spend vs revenue"
                      subtitle={per}
                      height={260}
                      {...state}
                      empty={Boolean(data) && !total('revenue') && !total('spend')}
                      emptyMessage="No sales or ad results in this period."
                      table={seriesTable(points, granularity, ['revenue', 'spend'])}
                    >
                      <TrendChart
                        data={points}
                        granularity={granularity}
                        format="currency"
                        series={[
                          { key: 'revenue', label: 'Revenue', color: METRIC_COLORS.revenue },
                          { key: 'spend', label: 'Ad spend', color: METRIC_COLORS.spend },
                        ]}
                      />
                    </ChartCard>
                    <ChartCard
                      title="Experiments completed"
                      subtitle="Per week"
                      value={experimentsDone ? fmtNumber(experimentsDone) : null}
                      height={260}
                      {...queryState(weekly)}
                      empty={Boolean(weekly.data) && !experimentsDone}
                      emptyMessage="No experiments completed in this period."
                      table={{
                        rowKey: 'key',
                        rows: weekPoints,
                        columns: [periodColumn('week', 'key', 'Week'), countColumn('experimentsCompleted', 'Completed')],
                      }}
                    >
                      <ColumnChart
                        data={weekPoints}
                        granularity="week"
                        series={[{ key: 'experimentsCompleted', label: 'Experiments', color: SERIES[0] }]}
                      />
                    </ChartCard>
                  </div>
                </Section>
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
