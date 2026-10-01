import { useState } from 'react';
import { CalendarClock, FlaskConical, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { LABELS, METRICS } from '@product-lab/shared/constants';
import { deriveMetrics, round, sumTotals } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { METRIC_COLORS } from '../../components/charts/palette.js';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { DASH, fmtDate, fmtDuration, fmtMetric, fmtNumber, formatValue, plural } from '../../lib/format.js';
import { metricColumn, periodColumn } from '../../lib/metricDisplay.js';
import { EvidenceGrid } from '../decisions/DecisionModal.jsx';
import { experimentDates } from '../experiments/ExperimentParts.jsx';
import { BlockSummaryList } from '../plan/PlanParts.jsx';
import { weeklyMinutes } from '../plan/schedule.js';
import { sumOf } from '../reviews/ReviewParts.jsx';
import { SessionList } from './GoalParts.jsx';

export const RESULT_METRICS = ['revenue', 'purchases', 'contribution'];
const EXPERIMENT_ORDER = { running: 0, planned: 1, completed: 2, stopped: 3 };
const EXPERIMENT_ROWS = 5;
const SESSIONS = 5;

export function ProductResults({ goal, query, metric }) {
  const totals = new Map((query.data?.items ?? []).map((p) => [p._id, p]));
  const rows = goal.products
    .map((p) => ({ ...totals.get(p._id), _id: p._id, name: p.name, status: p.status }))
    .sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
  const total = rows.reduce((sum, r) => sum + (r[metric] ?? 0), 0);
  const [single] = rows.length === 1 ? rows : [];
  return (
    <ChartCard
      title={single ? 'Linked product' : 'Linked products'}
      subtitle={
        single ? (
          <>
            <Link
              to={`/products/${single._id}`}
              className="relative inline-block max-w-full text-ink hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3"
            >
              {single.name}
            </Link>
            {single.status === 'killed' && ' (killed)'} · recorded in the goal period
          </>
        ) : (
          `${METRICS[metric].label} in the goal period`
        )
      }
      value={single || !query.data ? null : fmtMetric(metric, total)}
      height={null}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.error}
      onRetry={query.refetch}
      table={{
        rowKey: '_id',
        rows,
        columns: [
          { key: 'name', header: 'Product' },
          { key: 'status', header: 'Status', format: (v) => LABELS.status[v] ?? v },
          ...RESULT_METRICS.map((k) => metricColumn(k)),
        ],
      }}
    >
      {single ? (
        <EvidenceGrid totals={single} />
      ) : (
        <>
          <BarList
            format={METRICS[metric].format}
            labelWidth="14rem"
            items={rows.map((p) => ({
              key: p._id,
              label: p.status === 'killed' ? `${p.name} (killed)` : p.name,
              value: p[metric] ?? 0,
              href: `/products/${p._id}`,
              muted: p.status === 'killed',
            }))}
          />
          <h3 className="mt-5 mb-3 border-t border-hairline-soft pt-4 text-xs font-medium tracking-wide text-muted uppercase">All linked products</h3>
          <EvidenceGrid totals={deriveMetrics(sumTotals(rows))} />
        </>
      )}
    </ChartCard>
  );
}

export function ExperimentResults({ goal, query, metric }) {
  const [expanded, setExpanded] = useState(false);
  const linked = new Set(goal.productIds.map(String));
  const all = (query.data?.items ?? []).filter((x) => linked.has(String(x.productId)));
  const rows = all
    .filter((x) => x.hasData || x.status === 'running' || x.status === 'planned')
    .sort((a, b) => EXPERIMENT_ORDER[a.status] - EXPERIMENT_ORDER[b.status] || (b[metric] ?? 0) - (a[metric] ?? 0));
  const visible = expanded ? rows : rows.slice(0, EXPERIMENT_ROWS);
  const max = Math.max(0, ...rows.map((x) => x[metric] ?? 0));
  const hidden = all.length - rows.length;
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <CardHeader
        title="Experiments"
        subtitle={`On linked products · ${METRICS[metric].label.toLowerCase()} in the goal period`}
        actions={
          <ButtonLink to={goal.productIds.length === 1 ? `/experiments?productId=${goal.productIds[0]}` : '/experiments'} size="sm" variant="ghost">
            All
          </ButtonLink>
        }
      />
      <div className="mt-3 min-w-0 flex-1">
        {query.isPending ? (
          <Skeleton className="h-32" />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} compact />
        ) : !rows.length ? (
          <EmptyState compact icon={FlaskConical} title="No experiments in the goal period." description="Tests you run on the linked products show up here." />
        ) : (
          <ul className="divide-y divide-hairline-soft">
            {visible.map((x) => (
              <li key={x._id} className="relative py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        to={`/experiments/${x._id}`}
                        className="min-w-0 truncate text-[13px] font-medium text-ink hover:underline max-md:after:absolute max-md:after:inset-0 max-md:after:z-[1]"
                      >
                        {x.name}
                      </Link>
                      <StatusBadge kind="experimentStatus" value={x.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {x.product?.name} · {experimentDates(x)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[13px] font-medium text-ink tabular-nums">{x.hasData ? fmtMetric(metric, x[metric]) : DASH}</span>
                </div>
                {x[metric] > 0 && (
                  <div className="mt-2" aria-hidden>
                    <Meter value={x[metric]} max={max} height={4} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(rows.length > EXPERIMENT_ROWS || hidden > 0) && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-hairline-soft pt-2">
          <p className="text-xs text-muted">{hidden > 0 && `${plural(hidden, 'older experiment')} without results in this period not shown`}</p>
          {rows.length > EXPERIMENT_ROWS && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show fewer' : `Show all ${rows.length}`}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

export function FocusCard({ goal, period, series, sessions }) {
  const started = period.from <= period.to;
  const points = (started && series.data?.points) || [];
  const granularity = series.data?.granularity ?? 'day';
  const max = Math.max(0, ...points.map((p) => p.focusMinutes));
  const unit = max < 60 ? 'minutes' : 'hours';
  const rows = points.map((p) => ({ key: p.key, value: unit === 'hours' ? p.focusHours : round(p.focusMinutes, 0) }));
  const count = sumOf(points, 'sessions');
  const recent = (sessions.data?.items ?? []).filter((s) => s.status !== 'cancelled');
  const start = (
    <ButtonLink to="/today" size="sm" icon={Timer}>
      Start a focus session
    </ButtonLink>
  );
  return (
    <ChartCard
      title="Focus on this goal"
      subtitle={
        recent.length
          ? `${unit === 'hours' ? 'Hours' : 'Minutes'} per ${granularity} · ${plural(count, 'session')} since ${fmtDate(period.from, { year: true })}`
          : 'Sessions logged against it'
      }
      value={recent.length ? formatValue('hours', goal.focusHours) : null}
      height={null}
      loading={sessions.isPending || (started && series.isPending)}
      fetching={sessions.isFetching || series.isFetching}
      error={sessions.error ?? series.error}
      onRetry={() => [sessions, series].forEach((q) => q.refetch())}
      empty={!recent.length}
      emptyMessage="No focus sessions yet."
      emptyAction={start}
      table={{
        rowKey: 'key',
        rows,
        columns: [periodColumn(granularity), { key: 'value', header: `Focus ${unit}`, align: 'right', format: (v) => fmtNumber(v, { digits: 2 }) }],
      }}
    >
      {max > 0 && (
        <div className="h-40">
          <ColumnChart
            data={rows}
            granularity={granularity}
            series={[
              { key: 'value', label: `Focus ${unit}`, color: METRIC_COLORS.focus, format: (v) => fmtDuration(unit === 'hours' ? v * 60 : v) },
            ]}
          />
        </div>
      )}
      <SessionList sessions={recent.slice(0, SESSIONS)} meta={(s) => [s.productName, s.experimentName]} className={max > 0 ? 'mt-4' : ''} />
    </ChartCard>
  );
}

export function BlocksCard({ goal, query }) {
  const blocks = (query.data?.items ?? []).filter((b) => String(b.goalId) === goal._id);
  const weekly = weeklyMinutes(blocks);
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <CardHeader
        title="Time blocks"
        subtitle={weekly ? `${fmtDuration(weekly)} a week scheduled for this goal` : 'Recurring time scheduled for this goal'}
        actions={
          <ButtonLink to="/plan" size="sm" variant="ghost" icon={CalendarClock}>
            Plan
          </ButtonLink>
        }
      />
      <div className="mt-3 min-w-0 flex-1">
        {query.isPending ? (
          <Skeleton className="h-24" />
        ) : query.error ? (
          <ErrorState error={query.error} onRetry={query.refetch} compact />
        ) : !blocks.length ? (
          <EmptyState compact icon={CalendarClock} title="No time blocks linked." description="Link a block to this goal on the Plan page." />
        ) : (
          <BlockSummaryList blocks={blocks} />
        )}
      </div>
    </Card>
  );
}
