import { useState } from 'react';
import { Check, ChevronDown, Gavel, GitCompareArrows, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { EXPERIMENT_STATUSES, EXPERIMENT_VARIABLES, LABELS, METRICS } from '@product-lab/shared/constants';
import { breakEven, changedVariables, pctChange } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Funnel } from '../../components/charts/Funnel.jsx';
import { Delta, KpiGrid } from '../../components/charts/KpiTile.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { METRIC_COLORS, SERIES } from '../../components/charts/palette.js';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { Dot, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { FilterBar, PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { Popover } from '../../components/ui/Popover.jsx';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtCurrency, fmtDate, fmtMetric, fmtNumber, plural } from '../../lib/format.js';
import { funnelTable, hasActivity, seriesTable } from '../../lib/metricDisplay.js';
import { useAnalytics, useItem, useList, useMutate, useUpdate } from '../../lib/queries.js';
import { statusMeta } from '../../lib/status.js';
import { AIInsightPanel } from '../ai/AIInsightPanel.jsx';
import { DecisionList } from '../decisions/DecisionList.jsx';
import { DecisionModal } from '../decisions/DecisionModal.jsx';
import { CreativeFormModal } from './CreativeFormModal.jsx';
import { CreativesSection } from './CreativesSection.jsx';
import { ExperimentFormModal } from './ExperimentFormModal.jsx';
import {
  byStart,
  experimentDates,
  experimentSpan,
  fmtVariable,
  isSmallSample,
  needsStart,
  ScopeControl,
  SmallSampleNote,
  useScope,
} from './ExperimentParts.jsx';
import { MetricEntriesSection } from './MetricEntriesSection.jsx';
import { MetricEntryModal } from './MetricEntryModal.jsx';

const KPIS = ['spend', 'purchases', 'revenue', 'cac', 'roas', 'conversionRate', 'ctr', 'aov'];
const CHANGE_METRICS = ['cac', 'roas', 'conversionRate', 'aov'];

function StatusMenu({ value, onChange, busy }) {
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-expanded={open}
          aria-label={`Status: ${LABELS.experimentStatus[value]}. Change status`}
          className="inline-flex items-center gap-0.5 rounded-full transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          <StatusBadge kind="experimentStatus" value={value} />
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <ul className="w-44 p-1.5">
          {EXPERIMENT_STATUSES.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  close();
                  if (s !== value) onChange(s);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink hover:bg-tint/70"
              >
                <Dot color={statusMeta('experimentStatus', s).color} />
                <span className="flex-1">{LABELS.experimentStatus[s]}</span>
                {s === value && <Check className="size-4 stroke-[2.5]" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function Fact({ label, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-[13px] text-ink">{children}</div>
    </div>
  );
}

function Variable({ label, value, was, changed }) {
  return (
    <div className={`min-w-0 rounded-md border px-3 py-2 ${changed ? 'border-accent/50 bg-tint/60' : 'border-hairline-soft'}`}>
      <dt className="flex items-center justify-between gap-2 text-xs text-muted">
        {label}
        {changed && (
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden />
            Changed
          </span>
        )}
      </dt>
      <dd className="mt-0.5 text-[13px] font-medium break-words text-ink">{value}</dd>
      {changed && <dd className="mt-0.5 truncate text-xs text-muted">was {was}</dd>}
    </div>
  );
}

function VariablesCard({ experiment: x, previous, changed, spend, today, status }) {
  const names = EXPERIMENT_VARIABLES.filter((v) => changed.includes(v.key)).map((v) => v.label);
  const subtitle =
    status !== 'success'
      ? 'The setup recorded for this test'
      : !previous
        ? 'First experiment for this product'
        : names.length
          ? `Changed vs ${previous.name}: ${names.join(', ')}`
          : `Same variables as ${previous.name}`;
  const daily = x.dailyBudget ? ` · ${fmtCurrency(x.dailyBudget)} a day` : '';
  const budget = x.budget
    ? `${fmtCurrency(x.budget)}${daily}`
    : x.dailyBudget
      ? `${fmtCurrency(x.dailyBudget)} a day, no total set`
      : 'No budget set';
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5 lg:col-span-3">
      <CardHeader title="What was tested" subtitle={subtitle} />
      <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {EXPERIMENT_VARIABLES.map(({ key, label }) => (
          <Variable
            key={key}
            label={label}
            value={fmtVariable(key, x.variables?.[key])}
            was={previous && fmtVariable(key, previous.variables?.[key])}
            changed={changed.includes(key)}
          />
        ))}
        <Variable label="Campaign" value={x.campaign || DASH} />
        <Variable label="Dates" value={experimentSpan(x, today)} />
      </dl>
      {(x.hypothesis || x.changeNote) && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {x.hypothesis && <Fact label="Hypothesis">{x.hypothesis}</Fact>}
          {x.changeNote && <Fact label="Change note">{x.changeNote}</Fact>}
        </div>
      )}
      <div className="mt-auto pt-4">
        <div className="border-t border-hairline-soft pt-4">
          {x.budget && status === 'pending' ? (
            <Skeleton className="h-8" />
          ) : x.budget && spend != null ? (
            <Meter
              label={`Budget used${daily}`}
              valueLabel={`${fmtCurrency(spend)} of ${fmtCurrency(x.budget)}`}
              value={spend}
              max={x.budget}
              tone={spend > x.budget ? 'warning' : 'default'}
            />
          ) : (
            <Fact label="Budget">{budget}</Fact>
          )}
        </div>
      </div>
    </Card>
  );
}

function ChangeCard({ current, previous, next, query }) {
  if (query.isPending || query.error) {
    return (
      <Card className="p-4 sm:p-5 lg:col-span-2">
        {query.error ? <ErrorState error={query.error} onRetry={query.refetch} compact /> : <Skeleton className="h-72" />}
      </Card>
    );
  }
  if (!previous) {
    return (
      <Card className="flex min-w-0 flex-col p-4 sm:p-5 lg:col-span-2">
        <CardHeader title="Before and after" subtitle="Compared with the previous experiment of this product" />
        <EmptyState
          compact
          className="flex-1"
          title="This is the first experiment."
          description={next ? `${next.name} is compared with this one.` : 'The next experiment will be compared with this one.'}
        />
      </Card>
    );
  }
  const both = current?.hasData && previous.hasData;
  const sample = `${fmtNumber(previous.purchases)} vs ${fmtNumber(current?.purchases)} purchases`;
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5 lg:col-span-2">
      <CardHeader
        title="Before and after"
        subtitle={
          <>
            Before is{' '}
            <Link to={`/experiments/${previous._id}`} className="text-body hover:text-ink hover:underline">
              {previous.name}
            </Link>
            , all time
          </>
        }
      />
      {both ? (
        <ul className="mt-4 space-y-4">
          {CHANGE_METRICS.map((k) => (
            <li key={k}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-ink">{METRICS[k].label}</span>
                <Delta value={pctChange(current[k], previous[k])} better={METRICS[k].better} />
              </div>
              <BarList
                format={METRICS[k].format}
                labelWidth="3.5rem"
                max={Math.max(current[k] ?? 0, previous[k] ?? 0)}
                items={[
                  { key: 'before', label: 'Before', value: previous[k], muted: true },
                  { key: 'after', label: 'After', value: current[k] },
                ]}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          compact
          className="flex-1"
          title="Nothing to compare yet."
          description={current?.hasData ? `${previous.name} has no recorded results.` : 'Record metrics to see how this one compares.'}
        />
      )}
      {both && (isSmallSample(current) || isSmallSample(previous)) ? (
        <SmallSampleNote className="mt-4">Small sample ({sample}) — differences may be noise.</SmallSampleNote>
      ) : (
        both && <p className="mt-4 text-xs text-muted">Based on {sample}.</p>
      )}
      <p className="mt-1.5 text-xs text-muted">History, not proof: other things can differ between tests.</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <ButtonLink to={`/experiments/compare?ids=${previous._id},${current?._id}`} size="sm" icon={GitCompareArrows}>
          Compare side by side
        </ButtonLink>
        {next && (
          <Link to={`/experiments/${next._id}`} className="truncate text-xs text-muted hover:text-ink hover:underline">
            Next: {next.name}
          </Link>
        )}
      </div>
    </Card>
  );
}

function Results({ experiment: x, scope, summary, series, onRecord }) {
  const current = summary.data?.current;
  const points = series.data?.points ?? [];
  const granularity = series.data?.granularity ?? scope.granularity ?? 'day';
  const breakEvenCac = breakEven({ price: x.variables?.price ?? x.product?.price, aov: current?.aov, ...x.product?.costs }).breakEvenCac;
  const showBreakEven = Boolean(current) && breakEvenCac > 0 && points.some((p) => p.cac >= breakEvenCac);
  const chartState = { loading: series.isPending, fetching: series.isFetching, error: series.error, onRetry: series.refetch };

  if (summary.error) {
    return (
      <Card>
        <ErrorState error={summary.error} onRetry={summary.refetch} />
      </Card>
    );
  }
  if (summary.isSuccess && !hasActivity(current)) {
    return (
      <Card>
        <EmptyState
          title={scope.lifetime ? 'No metrics recorded yet.' : 'No metrics in this period.'}
          description={
            scope.lifetime ? 'Record what the ad platform reports to see spend, CAC and the funnel here.' : 'Results outside this range are not shown.'
          }
          action={
            scope.lifetime ? (
              <Button icon={Plus} onClick={onRecord}>
                Record metrics
              </Button>
            ) : (
              <Button onClick={() => scope.setLifetime(true)}>Show all time</Button>
            )
          }
        />
      </Card>
    );
  }

  return (
    <>
      <KpiGrid keys={KPIS} summary={summary} points={points} comparisonLabel={scope.comparisonLabel} />
      {isSmallSample(current) && (
        <SmallSampleNote className="mt-3">
          Small sample — {plural(current.purchases, 'purchase')} so far. Differences may be noise.
        </SmallSampleNote>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue vs ad spend"
          subtitle="Money in and money out"
          height={270}
          {...chartState}
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
          title="Conversion funnel"
          subtitle="Where buyers drop out"
          height={null}
          loading={summary.isPending}
          fetching={summary.isFetching}
          table={funnelTable(current)}
        >
          <Funnel totals={current} />
        </ChartCard>
        <ChartCard
          className="lg:col-span-2"
          title="CAC over time"
          subtitle={showBreakEven ? 'Dashed line: break-even CAC after fees and refunds' : 'Ad spend per purchase'}
          value={current && fmtMetric('cac', current.cac)}
          height={220}
          {...chartState}
          table={seriesTable(points, granularity, ['cac', 'spend', 'purchases'])}
          insight={
            current?.cac != null && breakEvenCac > 0
              ? `CAC is ${current.cac <= breakEvenCac ? 'below' : 'above'} the ${fmtCurrency(breakEvenCac)} break-even for this period.`
              : null
          }
        >
          <TrendChart
            data={points}
            granularity={granularity}
            format="currency"
            series={[{ key: 'cac', label: 'CAC', color: SERIES[1] }]}
            reference={showBreakEven ? { value: breakEvenCac, label: `Break-even ${fmtCurrency(breakEvenCac)}` } : undefined}
          />
        </ChartCard>
        <ChartCard
          title="Purchases"
          value={current && fmtNumber(current.purchases)}
          height={220}
          {...chartState}
          table={seriesTable(points, granularity, ['purchases'])}
        >
          <ColumnChart data={points} granularity={granularity} series={[{ key: 'purchases', label: 'Purchases', color: SERIES[0] }]} />
        </ChartCard>
      </div>
    </>
  );
}

function removal(dialog, x) {
  if (dialog?.kind === 'deleteCreative') {
    return {
      path: `/creatives/${dialog.item._id}`,
      title: 'Delete creative?',
      done: 'Creative deleted',
      message: `${dialog.item.name} will be removed. Creatives with recorded metrics are kept for history and cannot be deleted.`,
    };
  }
  if (dialog?.kind === 'deleteEntry') {
    return {
      path: `/metrics/${dialog.item._id}`,
      title: 'Delete metric entry?',
      done: 'Metric entry deleted',
      message: `The ${fmtDate(dialog.item.date, { year: true })} entry will be removed and every total recalculated.`,
    };
  }
  if (dialog?.kind === 'deleteExperiment') {
    return {
      path: `/experiments/${x._id}`,
      title: 'Delete experiment?',
      done: 'Experiment deleted',
      message: `${x.name} and its creatives will be removed. Experiments with results or decisions cannot be deleted.`,
      then: `/products/${x.productId}`,
    };
  }
  return null;
}

function Decisions({ query, onRecord }) {
  return (
    <Section
      title="Decisions"
      description="Calls made on this experiment and the evidence at the time"
      actions={
        <Button size="sm" icon={Gavel} onClick={onRecord}>
          Record decision
        </Button>
      }
    >
      <Card className="min-w-0 p-4 sm:p-5">
        <DecisionList query={query} />
      </Card>
    </Section>
  );
}

export default function ExperimentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { today } = useDateRange();
  const toast = useToast();
  const scope = useScope();
  const [dialog, setDialog] = useState(null);
  const [removing, setRemoving] = useState(false);

  const experiment = useItem('experiments', id, { enabled: !removing });
  const x = experiment.data;
  const siblings = useAnalytics('experiments', { productId: x?.productId }, { enabled: Boolean(x?.productId) });
  const scoped = { experimentId: id, ...scope.params };
  const summary = useAnalytics('summary', scoped);
  const series = useAnalytics('timeseries', { ...scoped, granularity: scope.granularity });
  const creatives = useAnalytics('creatives', scoped);
  const decisions = useList('decisions', { experimentId: id });
  const update = useUpdate('experiments');
  const remove = useMutate((path) => api(path, { method: 'DELETE' }));
  const close = () => setDialog(null);

  if (experiment.isPending) return <PageLoader />;
  if (experiment.error) {
    return (
      <>
        <PageHeader title="Experiment" back={{ to: '/experiments', label: 'Experiments' }} />
        <Card>
          <ErrorState error={experiment.error} onRetry={experiment.error.status === 404 ? undefined : experiment.refetch} />
        </Card>
      </>
    );
  }

  const history = [...(siblings.data?.items ?? [])].sort(byStart);
  const index = history.findIndex((e) => e._id === id);
  const self = history[index];
  const previous = index > 0 ? history[index - 1] : null;
  const next = index >= 0 ? (history[index + 1] ?? null) : null;
  const changed = previous ? changedVariables(previous.variables, x.variables) : [];
  const record = (creativeId) => setDialog({ kind: 'metrics', defaults: { productId: x.productId, experimentId: id, creativeId } });
  const deleting = removal(dialog, x);
  const deletable = siblings.isSuccess && !self?.hasData && decisions.isSuccess && !decisions.data.items.length;

  async function changeStatus(status) {
    const body = { status };
    if (status === 'running' && needsStart(x.startDate, today)) body.startDate = today;
    if (status === 'running' && x.endDate && x.endDate < today) body.endDate = null;
    if ((status === 'completed' || status === 'stopped') && !x.endDate && (!x.startDate || x.startDate <= today)) body.endDate = today;
    try {
      await update.mutateAsync({ id, ...body });
      const dated = body.endDate
        ? `, ended ${fmtDate(today)}`
        : body.startDate
          ? `, started ${fmtDate(today)}`
          : body.endDate === null
            ? ', end date cleared'
            : '';
      toast.success(`Marked as ${LABELS.experimentStatus[status].toLowerCase()}${dated}`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function confirmDelete() {
    setRemoving(Boolean(deleting.then));
    try {
      await remove.mutateAsync(deleting.path);
      toast.success(deleting.done);
      if (deleting.then) navigate(deleting.then);
    } catch (err) {
      setRemoving(false);
      toast.error(err);
    }
    close();
  }

  return (
    <>
      <PageHeader
        back={{ to: `/products/${x.productId}`, label: x.product?.name ?? 'Product' }}
        title={x.name}
        meta={<StatusMenu value={x.status} onChange={changeStatus} busy={update.isPending} />}
        description={`${x.product?.name ?? 'Product'} · ${experimentDates(x)}${x.campaign ? ` · ${x.campaign}` : ''}`}
        actions={
          <>
            {deletable && (
              <IconButton icon={Trash2} variant="secondary" label="Delete experiment" onClick={() => setDialog({ kind: 'deleteExperiment' })} />
            )}
            <Button icon={Pencil} onClick={() => setDialog({ kind: 'edit' })}>
              Edit
            </Button>
            <Button icon={Gavel} onClick={() => setDialog({ kind: 'decision' })}>
              Record decision
            </Button>
            <Button icon={ImagePlus} onClick={() => setDialog({ kind: 'creative' })}>
              Add creative
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => record()}>
              Record metrics
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <VariablesCard experiment={x} previous={previous} changed={changed} spend={self?.spend} today={today} status={siblings.status} />
        <ChangeCard current={self} previous={previous} next={next} query={siblings} />
      </div>

      <FilterBar className="mt-8">
        <ScopeControl scope={scope} />
        {scope.lifetime && <span className="text-[13px] text-muted">Totals for the whole experiment</span>}
      </FilterBar>
      <Results experiment={x} scope={scope} summary={summary} series={series} onRecord={() => record()} />

      <CreativesSection
        query={creatives}
        scoped={!scope.lifetime}
        campaign={x.campaign}
        onAdd={() => setDialog({ kind: 'creative' })}
        onRecord={(c) => record(c._id)}
        onEdit={(c) => setDialog({ kind: 'creative', creative: c })}
        onDelete={(c) => setDialog({ kind: 'deleteCreative', item: c })}
      />
      <MetricEntriesSection
        experimentId={id}
        params={scope.params}
        onRecord={() => record()}
        onEdit={(entry) => setDialog({ kind: 'metrics', entry })}
        onDelete={(entry) => setDialog({ kind: 'deleteEntry', item: entry })}
      />
      <Decisions query={decisions} onRecord={() => setDialog({ kind: 'decision' })} />
      <div className="mt-8">
        <AIInsightPanel kind="experiment" targetId={id} />
      </div>

      <MetricEntryModal open={dialog?.kind === 'metrics'} onClose={close} defaults={dialog?.defaults} entry={dialog?.entry} />
      <CreativeFormModal open={dialog?.kind === 'creative'} onClose={close} experimentId={id} creative={dialog?.creative} />
      <ExperimentFormModal open={dialog?.kind === 'edit'} onClose={close} experiment={x} />
      <DecisionModal
        open={dialog?.kind === 'decision'}
        onClose={close}
        productId={x.productId}
        experimentId={id}
        productStatus={x.product?.status}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={close}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        title={deleting?.title}
        message={deleting?.message}
      />
    </>
  );
}
