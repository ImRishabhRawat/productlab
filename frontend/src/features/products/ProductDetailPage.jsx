import { useState } from 'react';
import { ChartLine, FlaskConical, Gavel, PackageX, Pencil, Plus, Skull } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { pctChange } from '@product-lab/shared/metrics';
import { objectId } from '@product-lab/shared/schemas';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Funnel } from '../../components/charts/Funnel.jsx';
import { KpiGrid } from '../../components/charts/KpiTile.jsx';
import { METRIC_COLORS, SERIES } from '../../components/charts/palette.js';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { DateRangePicker, GranularityControl } from '../../components/ui/DateRangePicker.jsx';
import { FilterBar, PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, PageLoader, Skeleton } from '../../components/ui/States.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtCurrency, fmtDate, fmtMetric, fmtPercent, fmtRatio } from '../../lib/format.js';
import { funnelTable, hasActivity, seriesTable } from '../../lib/metricDisplay.js';
import { useAnalytics, useItem, useList } from '../../lib/queries.js';
import { AIInsightPanel } from '../ai/AIInsightPanel.jsx';
import { DecisionModal, EvidenceGrid } from '../decisions/DecisionModal.jsx';
import { ExperimentFormModal } from '../experiments/ExperimentFormModal.jsx';
import { MetricEntryModal } from '../experiments/MetricEntryModal.jsx';
import { ProductEconomics } from './ProductEconomics.jsx';
import { ProductExperiments } from './ProductExperiments.jsx';
import { ProductFormModal } from './ProductFormModal.jsx';
import { ProductGoals } from './ProductGoals.jsx';
import { ProductHistory } from './ProductHistory.jsx';
import { productBreakEven } from './productMetrics.js';
import { ProductStatusMenu } from './ProductStatusMenu.jsx';

const KPIS = ['purchases', 'revenue', 'spend', 'cac', 'aov', 'roas', 'conversionRate', 'contribution'];
const KPI_LABELS = { purchases: 'Total sales' };
const TABS = [
  { value: 'performance', label: 'Performance' },
  { value: 'experiments', label: 'Experiments' },
  { value: 'economics', label: 'Economics' },
  { value: 'history', label: 'History' },
];

function ProductError({ error, onRetry }) {
  const missing = error.status === 404;
  return (
    <>
      <PageHeader title={missing ? 'Product not found' : 'Product'} back={{ to: '/products', label: 'Products' }} />
      <Card>
        {missing ? (
          <EmptyState
            icon={PackageX}
            title="This product does not exist."
            description="Check the link. Products are never deleted, so it was likely mistyped."
            action={<ButtonLink to="/products">All products</ButtonLink>}
          />
        ) : (
          <ErrorState error={error} onRetry={onRetry} />
        )}
      </Card>
    </>
  );
}

function KilledBanner({ product: p, onEdit }) {
  return (
    <div role="status" className="mb-5 flex items-start gap-3 rounded-lg border border-critical/25 bg-critical/5 p-4">
      <Skull className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
      <div className="min-w-0 flex-1 text-[13px]">
        <p className="font-medium text-ink">
          Killed {fmtDate(p.killedAt ?? p.statusChangedAt, { year: true })}
          {p.killReason && <span className="font-normal text-body"> · {p.killReason}</span>}
        </p>
        {p.learnings ? (
          <p className="mt-1 text-body">
            <span className="font-medium text-ink">Learnings: </span>
            {p.learnings}
          </p>
        ) : (
          <p className="mt-1 text-muted">No learnings recorded yet.</p>
        )}
      </div>
      <Button size="sm" variant="ghost" onClick={onEdit}>
        {p.learnings ? 'Edit' : 'Add learnings'}
      </Button>
    </div>
  );
}

function PurchaseSignal({ totals, loading, decisions, onDecide, onHistory }) {
  const items = decisions.data?.items ?? [];
  const latest = items[0];
  return (
    <Card className="mt-4 p-4 sm:p-5">
      <CardHeader
        title="Purchase signal"
        subtitle="All-time evidence. It informs the call, it does not make it."
        actions={
          <Button size="sm" icon={Gavel} onClick={onDecide}>
            Record decision
          </Button>
        }
      />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-6">
        <EvidenceGrid totals={totals} loading={loading} />
        <div className="min-w-0 rounded-lg bg-tint/60 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Latest decision</h3>
            {items.length > 1 && (
              <button type="button" onClick={onHistory} className="text-xs text-muted hover:text-ink hover:underline">
                All {items.length}
              </button>
            )}
          </div>
          {decisions.isPending ? (
            <Skeleton className="mt-2 h-12" />
          ) : decisions.error ? (
            <ErrorState error={decisions.error} onRetry={decisions.refetch} compact />
          ) : latest ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <StatusBadge kind="decision" value={latest.decision} />
                <span className="text-xs text-muted">{fmtDate(latest.date, { year: true })}</span>
              </div>
              <p className="mt-1.5 line-clamp-2 text-[13px] text-body">{latest.reason}</p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted">No decision recorded yet.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function NoActivity({ earlier, onRecord, onExperiment }) {
  const { setPreset } = useDateRange();
  return (
    <Card>
      <EmptyState
        icon={ChartLine}
        title={earlier ? 'No ad data in this period.' : 'No ad data yet.'}
        description={
          earlier ? 'This product has earlier results. Widen the range to see them.' : 'Start a test, then record daily ad metrics to see revenue, CAC and ROAS here.'
        }
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {earlier ? (
              <Button size="sm" variant="primary" onClick={() => setPreset('all')}>
                Show all time
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={FlaskConical} onClick={onExperiment}>
                New experiment
              </Button>
            )}
            <Button size="sm" icon={Plus} onClick={onRecord}>
              Record metrics
            </Button>
          </div>
        }
      />
    </Card>
  );
}

function Performance({ product, summary, allTime, series, points, granularity, breakEven: be, onRecord, onExperiment }) {
  const current = summary.data?.current;
  if (summary.isSuccess && !hasActivity(current)) {
    if (allTime.isPending) return <Skeleton className="h-72" />;
    return <NoActivity earlier={hasActivity(allTime.data?.current)} onRecord={onRecord} onExperiment={onExperiment} />;
  }
  const chart = { loading: series.isPending, fetching: series.isFetching, error: series.error, onRetry: series.refetch };
  const cacGap = be.breakEvenCac > 0 ? pctChange(current?.cac, be.breakEvenCac) : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue vs ad spend"
          subtitle="Money in, money out and what is left after variable costs"
          height={290}
          {...chart}
          table={seriesTable(points, granularity, ['revenue', 'spend', 'contribution'])}
          insight={
            current?.revenue
              ? `${fmtCurrency(current.contribution)} contribution after ad spend and variable costs, a ${fmtPercent(current.contributionMargin)} margin.`
              : null
          }
        >
          <TrendChart
            data={points}
            granularity={granularity}
            format="currency"
            series={[
              { key: 'revenue', label: 'Revenue', color: METRIC_COLORS.revenue },
              { key: 'spend', label: 'Ad spend', color: METRIC_COLORS.spend },
              { key: 'contribution', label: 'Contribution', color: METRIC_COLORS.contribution },
            ]}
          />
        </ChartCard>
        <ChartCard
          title="Conversion funnel"
          subtitle="Where buyers drop out"
          height={null}
          loading={summary.isPending}
          fetching={summary.isFetching}
          error={summary.error}
          onRetry={summary.refetch}
          table={funnelTable(current)}
        >
          <Funnel totals={current} />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Purchases" value={fmtMetric('purchases', current?.purchases)} height={200} {...chart} table={seriesTable(points, granularity, ['purchases'])}>
          <ColumnChart data={points} granularity={granularity} series={[{ key: 'purchases', label: 'Purchases', color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard title="Ad spend" value={fmtCurrency(current?.spend)} height={200} {...chart} table={seriesTable(points, granularity, ['spend'])}>
          <TrendChart data={points} granularity={granularity} format="currency" area series={[{ key: 'spend', label: 'Ad spend', color: METRIC_COLORS.spend }]} />
        </ChartCard>
        <ChartCard
          title="Customer acquisition cost"
          subtitle="Lower is better"
          value={fmtMetric('cac', current?.cac)}
          height={200}
          {...chart}
          table={seriesTable(points, granularity, ['cac', 'spend', 'purchases'])}
          insight={cacGap != null ? `CAC is ${fmtPercent(Math.abs(cacGap))} ${cacGap <= 0 ? 'below' : 'above'} break-even in this period.` : null}
        >
          <TrendChart
            data={points}
            granularity={granularity}
            format="currency"
            series={[{ key: 'cac', label: 'CAC', color: SERIES[1] }]}
            reference={be.breakEvenCac > 0 ? { value: be.breakEvenCac, label: `Break-even ${fmtCurrency(be.breakEvenCac)}` } : undefined}
          />
        </ChartCard>
        <ChartCard
          title="Return on ad spend"
          subtitle="Higher is better"
          value={fmtMetric('roas', current?.roas)}
          height={200}
          {...chart}
          table={seriesTable(points, granularity, ['roas', 'revenue', 'spend'])}
          insight={
            be.targetRoas
              ? `${fmtRatio(be.targetRoas)} keeps your ${fmtPercent(product.desiredMarginPct)} target margin after costs.`
              : null
          }
        >
          <TrendChart
            data={points}
            granularity={granularity}
            format="ratio"
            series={[{ key: 'roas', label: 'ROAS', color: SERIES[0] }]}
            reference={be.breakEvenRoas ? { value: be.breakEvenRoas, label: `Break-even ${fmtRatio(be.breakEvenRoas)}` } : undefined}
          />
        </ChartCard>
      </div>
    </>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const range = useDateRange();
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState(null);
  const valid = { enabled: objectId.safeParse(id).success };
  const product = useItem('products', id);
  const summary = useAnalytics('summary', { from: range.params.from, to: range.params.to, productId: id }, valid);
  const series = useAnalytics('timeseries', { ...range.params, productId: id }, valid);
  const allTime = useAnalytics('summary', { productId: id }, valid);
  const decisions = useList('decisions', { productId: id }, valid);

  if (product.isPending) return <PageLoader />;
  if (product.error) return <ProductError error={product.error} onRetry={product.refetch} />;

  const p = product.data;
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'performance';
  const setTab = (value) => setParams(value === 'performance' ? {} : { tab: value }, { replace: true });
  const current = summary.data?.current;
  const points = series.data?.points ?? [];
  const granularity = series.data?.granularity ?? range.granularity;
  const be = productBreakEven(p, current);
  const show = (name) => () => setModal(name);
  const close = () => setModal(null);

  return (
    <>
      <PageHeader
        back={{ to: '/products', label: 'Products' }}
        title={p.name}
        meta={
          <>
            <StatusBadge value={p.status} />
            {p.version && <Badge>{p.version}</Badge>}
          </>
        }
        description={
          <>
            {[fmtCurrency(p.price), p.category, `Created ${fmtDate(p.createdAt, { year: true })}`].filter(Boolean).join(' · ')}
            {p.idea && (
              <>
                {' · '}
                <Link to={`/ideas/${p.idea._id}`} className="hover:text-ink hover:underline">
                  From idea
                </Link>
              </>
            )}
          </>
        }
        actions={
          <>
            <IconButton icon={Pencil} label="Edit product" variant="secondary" onClick={show('edit')} />
            <ProductStatusMenu product={p} />
            <Button icon={Plus} onClick={show('metrics')}>
              Record metrics
            </Button>
            <Button icon={FlaskConical} onClick={show('experiment')}>
              New experiment
            </Button>
            <Button variant="primary" icon={Gavel} onClick={show('decision')}>
              Record decision
            </Button>
          </>
        }
      />
      {p.status === 'killed' && <KilledBanner product={p} onEdit={show('edit')} />}
      <FilterBar>
        <DateRangePicker />
        <GranularityControl />
      </FilterBar>

      {summary.error ? (
        <Card>
          <ErrorState error={summary.error} onRetry={summary.refetch} />
        </Card>
      ) : (
        <KpiGrid keys={KPIS} labels={KPI_LABELS} summary={summary} points={points} comparisonLabel={range.comparisonLabel} />
      )}

      <PurchaseSignal
        totals={allTime.data?.current}
        loading={allTime.isPending}
        decisions={decisions}
        onDecide={show('decision')}
        onHistory={() => setTab('history')}
      />

      <Tabs className="-mx-4 mt-8 mb-4 px-4 sm:mx-0 sm:px-0" label="Product sections" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'performance' && (
        <Performance
          product={p}
          summary={summary}
          allTime={allTime}
          series={series}
          points={points}
          granularity={granularity}
          breakEven={be}
          onRecord={show('metrics')}
          onExperiment={show('experiment')}
        />
      )}
      {tab === 'experiments' && <ProductExperiments product={p} breakEven={be} onCreate={show('experiment')} />}
      {tab === 'economics' && <ProductEconomics product={p} summary={summary} />}
      {tab === 'history' && <ProductHistory product={p} decisions={decisions} onDecide={show('decision')} />}

      <ProductGoals productId={id} className="mt-8" />
      <div className="mt-8">
        <AIInsightPanel kind="product" targetId={id} />
      </div>

      <MetricEntryModal open={modal === 'metrics'} onClose={close} defaults={{ productId: id }} />
      <ExperimentFormModal open={modal === 'experiment'} onClose={close} productId={id} onSaved={(x) => navigate(`/experiments/${x._id}`)} />
      <DecisionModal open={modal === 'decision'} onClose={close} productId={id} productStatus={p.status} />
      <ProductFormModal open={modal === 'edit'} onClose={close} product={p} />
    </>
  );
}
