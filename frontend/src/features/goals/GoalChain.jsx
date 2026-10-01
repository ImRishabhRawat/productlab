import { useState } from 'react';
import { CalendarClock, FlaskConical, Timer } from 'lucide-react';
import { Link } from 'react-router';
import { LABELS, METRICS, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { autoGranularity, blockSpan, bucketRange, bucketStart, isoDateIn } from '@product-lab/shared/dates';
import { deriveMetrics, round, sumTotals } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { BLOCK_COLORS, METRIC_COLORS } from '../../components/charts/palette.js';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { DASH, fmtDate, fmtDuration, fmtMetric, fmtNumber, plural } from '../../lib/format.js';
import { metricColumn, periodColumn } from '../../lib/metricDisplay.js';
import { useSettings } from '../../lib/session.js';
import { EvidenceGrid } from '../decisions/DecisionModal.jsx';
import { experimentDates } from '../experiments/ExperimentParts.jsx';
import { daysLabel } from '../plan/schedule.js';

export const RESULT_METRICS = ['revenue', 'purchases', 'contribution'];
const { blockCategory: BLOCK_LABELS } = PRODUCTIVITY_LABELS;
const EXPERIMENT_ORDER = { running: 0, planned: 1, completed: 2, stopped: 3 };
const EXPERIMENT_ROWS = 5;

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

function focusSeries(sessions, period, timezone) {
  const granularity = autoGranularity(period);
  const buckets = new Map(bucketRange(period.from, period.to, granularity).map((k) => [k, 0]));
  let count = 0;
  for (const s of sessions) {
    const date = isoDateIn(s.startedAt, timezone);
    const key = bucketStart(date, granularity);
    if (date < period.from || date > period.to || !buckets.has(key)) continue;
    count += 1;
    buckets.set(key, buckets.get(key) + (s.minutes ?? 0));
  }
  const max = Math.max(0, ...buckets.values());
  const unit = max < 60 ? 'minutes' : 'hours';
  const points = [...buckets].map(([key, minutes]) => ({ key, value: unit === 'hours' ? round(minutes / 60, 2) : minutes }));
  return { granularity, count, unit, points, recorded: max > 0 };
}

export function FocusCard({ goal, period, query }) {
  const { timezone } = useSettings().data;
  const sessions = (query.data?.items ?? []).filter((s) => s.status !== 'cancelled');
  const started = period.from <= period.to;
  const { granularity, count, unit, points, recorded } = started
    ? focusSeries(sessions, period, timezone)
    : { granularity: 'day', count: 0, unit: 'hours', points: [], recorded: false };
  const start = (
    <ButtonLink to="/today" size="sm" icon={Timer}>
      Start a focus session
    </ButtonLink>
  );
  return (
    <ChartCard
      title="Focus on this goal"
      subtitle={
        sessions.length
          ? `${unit === 'hours' ? 'Hours' : 'Minutes'} per ${granularity} · ${plural(count, 'session')} since ${fmtDate(period.from, { year: true })}`
          : 'Sessions logged against it'
      }
      value={sessions.length ? `${fmtNumber(goal.focusHours, { digits: 1 })} h` : null}
      height={null}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.error}
      onRetry={query.refetch}
      empty={!sessions.length}
      emptyMessage="No focus sessions yet."
      emptyAction={start}
      table={{
        rowKey: 'key',
        rows: points,
        columns: [periodColumn(granularity), { key: 'value', header: `Focus ${unit}`, align: 'right', format: (v) => fmtNumber(v, { digits: 2 }) }],
      }}
    >
      {recorded && (
        <div className="h-40">
          <ColumnChart
            data={points}
            granularity={granularity}
            series={[
              { key: 'value', label: `Focus ${unit}`, color: METRIC_COLORS.focus, format: (v) => fmtDuration(unit === 'hours' ? v * 60 : v) },
            ]}
          />
        </div>
      )}
      <ul className={`divide-y divide-hairline-soft ${recorded ? 'mt-4' : ''}`}>
        {sessions.slice(0, 5).map((s) => (
          <li key={s._id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] text-ink">{s.label || BLOCK_LABELS[s.category]}</p>
              <p className="truncate text-xs text-muted">
                {[fmtDate(s.startedAt, { weekday: true }), s.productName, s.experimentName].filter(Boolean).join(' · ')}
              </p>
            </div>
            <span className="shrink-0 text-[13px] font-medium text-ink tabular-nums">{s.status === 'running' ? 'Running' : fmtDuration(s.minutes)}</span>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}

export function BlocksCard({ goal, query }) {
  const blocks = (query.data?.items ?? []).filter((b) => String(b.goalId) === goal._id);
  const weekly = blocks.filter((b) => b.enabled).reduce((sum, b) => sum + blockSpan(b).minutes * b.days.length, 0);
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
          <ul className="divide-y divide-hairline-soft">
            {blocks.map((b) => (
              <li key={b._id} className={`flex items-center gap-3 py-2.5 ${b.enabled ? '' : 'opacity-60'}`}>
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: BLOCK_COLORS[b.category] }} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{b.name}</p>
                  <p className="truncate text-xs text-muted">
                    {BLOCK_LABELS[b.category]} · {daysLabel(b.days)}
                    {!b.enabled && ' · Off'}
                  </p>
                </div>
                <span className="shrink-0 text-[13px] text-body tabular-nums">
                  {b.start}–{b.end}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
