import { useState } from 'react';
import { ChevronDown, ChevronUp, Lightbulb, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { IDEA_STATUSES, LABELS, METRICS } from '@product-lab/shared/constants';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Funnel } from '../../components/charts/Funnel.jsx';
import { KpiGrid } from '../../components/charts/KpiTile.jsx';
import { METRIC_COLORS, MUTED, SERIES } from '../../components/charts/palette.js';
import { ScatterPlot } from '../../components/charts/ScatterPlot.jsx';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { Dot } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { DateRangePicker, GranularityControl } from '../../components/ui/DateRangePicker.jsx';
import { EventIcon } from '../../components/ui/EventIcon.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtCurrency, fmtDate, fmtDelta, fmtMetric, fmtNumber, fmtRange, fmtRelative, plural } from '../../lib/format.js';
import { betterHint, funnelTable, hasActivity, metricColumn, metricOptions, moneyColumn, ranked, seriesTable } from '../../lib/metricDisplay.js';
import { useAnalytics } from '../../lib/queries.js';
import { statusMeta } from '../../lib/status.js';
import { useMediaQuery } from '../../lib/useMediaQuery.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { MetricEntryModal } from '../experiments/MetricEntryModal.jsx';
import { GoalsSummary } from '../goals/GoalsSummary.jsx';
import { TodayStrip } from '../today/TodayStrip.jsx';

const KPIS = ['revenue', 'spend', 'contribution', 'purchases', 'cac', 'conversionRate', 'aov', 'roas'];
const RANKINGS = ['revenue', 'purchases', 'spend', 'cac', 'roas', 'conversionRate', 'aov', 'contribution'];
const EXPERIMENT_METRICS = ['cac', 'roas', 'conversionRate', 'revenue'];
const STAGE_COLUMNS = [
  { key: 'label', header: 'Stage' },
  { key: 'products', header: 'Products', align: 'right' },
  { key: 'ideas', header: 'Ideas', align: 'right' },
  { key: 'count', header: 'Total', align: 'right' },
];

const rankTable = (rows, key, header) => ({ rowKey: '_id', rows, columns: [{ key: 'name', header }, metricColumn(key)] });

function stageLink({ status, products }) {
  if (status === 'killed') return '/products/graveyard';
  return !products && IDEA_STATUSES.includes(status) ? `/ideas?status=${status}` : `/products?status=${status}`;
}

function movement(pct) {
  if (pct == null) return null;
  if (Math.abs(pct) < 0.5) return 'held flat';
  return `${pct > 0 ? 'rose' : 'fell'} ${fmtDelta(Math.abs(pct)).replace('+', '')}`;
}

function revenueInsight(change, comparisonLabel) {
  const revenue = movement(change?.revenue);
  const spend = movement(change?.spend);
  if (!revenue || !spend) return null;
  return `Revenue ${revenue} while ad spend ${spend} ${comparisonLabel}.`;
}

function ActivityFeed({ query }) {
  const items = query.data?.items ?? [];
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} compact />;
  if (!items.length) return <EmptyState compact title="No activity yet." />;
  return (
    <ol className="space-y-3">
      {items.map((e, i) => (
        <li key={`${e.type}-${e.at}-${i}`} className="flex items-start gap-3">
          <EventIcon event={e} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink">
              {e.title}
              {e.type === 'price' && ` ${fmtCurrency(e.from)} → ${fmtCurrency(e.to)}`}
            </p>
            <p className="truncate text-xs text-muted">
              {e.productId ? (
                <Link to={`/products/${e.productId}`} className="hover:text-ink hover:underline">
                  {e.productName}
                </Link>
              ) : e.type === 'idea' ? (
                <Link to={`/ideas/${e.refId}`} className="hover:text-ink hover:underline">
                  Ideas
                </Link>
              ) : null}
              {e.note && <span> · {e.note}</span>}
            </p>
          </div>
          <time className="shrink-0 text-xs text-muted" dateTime={e.at} title={fmtDate(e.date, { year: true })}>
            {fmtRelative(e.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}

export default function OverviewPage() {
  const range = useDateRange();
  const mobile = useMediaQuery('(max-width: 767px)');
  const search = useSearchParamState();
  const [productId, setProductId] = useState('');
  const [rankBy, setRankBy] = useState('revenue');
  const [experimentMetric, setExperimentMetric] = useState('cac');
  const [recording, setRecording] = useState(false);
  const expanded = search.get('charts') === 'all';
  const details = !mobile || expanded;

  const scoped = { ...range.params, productId: productId || undefined };
  const summary = useAnalytics('summary', scoped);
  const series = useAnalytics('timeseries', scoped);
  const products = useAnalytics('products', range.params);
  const experiments = useAnalytics(
    'experiments',
    { from: range.params.from, to: range.params.to, productId: productId || undefined },
    { enabled: details },
  );
  const lifecycle = useAnalytics('lifecycle');
  const activity = useAnalytics('activity', { limit: 10 }, { enabled: details });

  const points = series.data?.points ?? [];
  const granularity = series.data?.granularity ?? range.granularity;
  const current = summary.data?.current;
  const productItems = products.data?.items ?? [];
  const activeProducts = productItems.filter((p) => p.hasData);
  const rankedProducts = ranked(productItems, rankBy);
  const experimentItems = (experiments.data?.items ?? []).filter((x) => x.hasData);
  const rankedExperiments = ranked(experimentItems, experimentMetric);
  const running = experimentItems.filter((x) => x.status === 'running').length;
  const stages = lifecycle.data?.stages ?? [];
  const sharedStages = stages.filter((s) => s.status !== 'killed' && s.products && s.ideas);
  const noData = summary.isSuccess && !hasActivity(current);
  const chartState = { loading: series.isPending, fetching: series.isFetching, error: series.error, onRetry: series.refetch, empty: noData };
  const productState = { loading: products.isPending, fetching: products.isFetching, error: products.error, onRetry: products.refetch };
  const experimentState = {
    loading: experiments.isPending,
    fetching: experiments.isFetching,
    error: experiments.error,
    onRetry: experiments.refetch,
    empty: !experimentItems.length,
    emptyMessage: 'No experiment activity in this period.',
  };
  const selectedProduct = productItems.find((p) => p._id === productId);
  const highlight = selectedProduct ? (p) => (p._id === productId ? SERIES[0] : MUTED) : undefined;

  if (products.isSuccess && !productItems.length && stages.every((s) => !s.count)) {
    return (
      <>
        <PageHeader title="Overview" />
        <TodayStrip className="mb-4" />
        <Card>
          <EmptyState
            className="px-4"
            icon={Lightbulb}
            title="Nothing to measure yet."
            description="Capture an idea, turn it into a product, then record ad metrics to light up this dashboard."
            action={<ButtonLink to="/ideas" variant="primary" icon={Plus}>Add an idea</ButtonLink>}
          />
        </Card>
        <Section>
          <GoalsSummary />
        </Section>
      </>
    );
  }

  const funnel = (
    <ChartCard
      title="Conversion funnel"
      subtitle="Where buyers drop out"
      height={null}
      loading={summary.isPending}
      fetching={summary.isFetching}
      error={summary.error}
      onRetry={summary.refetch}
      empty={noData}
      table={funnelTable(current)}
    >
      <Funnel totals={current} />
    </ChartCard>
  );
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`${selectedProduct ? selectedProduct.name : 'All products'} · ${fmtRange(range.range)}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setRecording(true)}>
            Record metrics
          </Button>
        }
      />
      {!mobile && <TodayStrip className="mb-5" />}
      <FilterBar>
        <DateRangePicker />
        <GranularityControl />
        <Select
          aria-label="Product"
          className="w-full sm:w-56"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder="All products"
          options={productItems.map((p) => ({ value: p._id, label: p.name }))}
        />
      </FilterBar>

      {summary.error ? (
        <Card>
          <ErrorState error={summary.error} onRetry={summary.refetch} />
        </Card>
      ) : (
        <KpiGrid keys={KPIS} summary={summary} points={points} comparisonLabel={range.comparisonLabel} />
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue vs ad spend"
          subtitle="Money in, money out and what is left after variable costs"
          height={290}
          {...chartState}
          table={seriesTable(points, granularity, ['revenue', 'spend', 'contribution'])}
          insight={revenueInsight(summary.data?.change, range.comparisonLabel)}
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
        {!mobile && funnel}
      </div>

      <Section className="flex flex-col gap-4">
        {mobile && <TodayStrip />}
        <GoalsSummary />
      </Section>

      {mobile && (
        <Button
          className="mt-4 w-full justify-center"
          aria-expanded={expanded}
          aria-controls="overview-details"
          onClick={() => search.set('charts', expanded ? null : 'all')}
        >
          {expanded ? 'Fewer charts' : 'More charts'}
          <Chevron className="size-4" aria-hidden />
        </Button>
      )}

      <div id="overview-details">
        {details && (
          <>
            {mobile && <div className="mt-4">{funnel}</div>}
            <Section
              title="Product performance"
              description={
                selectedProduct
                  ? `All products in this period · ${selectedProduct.name} ${selectedProduct.hasData ? 'highlighted' : 'has no activity'}`
                  : 'Which product deserves attention in this period'
              }
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard
                  title={`Ranked by ${METRICS[rankBy].label}`}
                  subtitle={betterHint(rankBy)}
                  height={null}
                  {...productState}
                  empty={!rankedProducts.length}
                  emptyMessage="No product activity in this period."
                  toolbar={<SegmentedControl size="sm" label="Rank by" options={metricOptions(RANKINGS)} value={rankBy} onChange={setRankBy} />}
                  table={rankTable(rankedProducts, rankBy, 'Product')}
                >
                  <BarList
                    format={METRICS[rankBy].format}
                    items={rankedProducts.map((p) => ({
                      key: p._id,
                      label: p.name,
                      value: p[rankBy],
                      href: `/products/${p._id}`,
                      muted: Boolean(selectedProduct) && p._id !== productId,
                    }))}
                  />
                </ChartCard>
                <ChartCard
                  title="Spend vs revenue"
                  subtitle="Products above the line return more than they spend"
                  height={300}
                  {...productState}
                  empty={!activeProducts.length}
                  emptyMessage="No product activity in this period."
                  table={{
                    rowKey: '_id',
                    columns: [{ key: 'name', header: 'Product' }, moneyColumn('spend', 'Spend'), moneyColumn('revenue', 'Revenue'), metricColumn('roas')],
                    rows: activeProducts,
                  }}
                >
                  <ScatterPlot
                    data={activeProducts}
                    x={{ key: 'spend', label: 'Ad spend', format: 'currency' }}
                    y={{ key: 'revenue', label: 'Revenue', format: 'currency' }}
                    reference={{ slope: 1, label: 'ROAS 1.0x' }}
                    colorFor={highlight}
                    extraRows={(p) => [{ label: 'ROAS', value: fmtMetric('roas', p.roas) }]}
                  />
                </ChartCard>
              </div>
            </Section>

            <Section title="Trends" description="Is advertising becoming more or less efficient?">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <ChartCard
                  title="Revenue"
                  value={fmtCurrency(current?.revenue)}
                  height={200}
                  {...chartState}
                  table={seriesTable(points, granularity, ['revenue'])}
                >
                  <TrendChart
                    data={points}
                    granularity={granularity}
                    format="currency"
                    area
                    series={[{ key: 'revenue', label: 'Revenue', color: SERIES[0] }]}
                  />
                </ChartCard>
                <ChartCard
                  title="Purchases"
                  value={fmtMetric('purchases', current?.purchases)}
                  height={200}
                  {...chartState}
                  table={seriesTable(points, granularity, ['purchases'])}
                >
                  <ColumnChart data={points} granularity={granularity} series={[{ key: 'purchases', label: 'Purchases', color: SERIES[0] }]} />
                </ChartCard>
                <ChartCard
                  title="Customer acquisition cost"
                  value={fmtMetric('cac', current?.cac)}
                  height={200}
                  {...chartState}
                  table={seriesTable(points, granularity, ['cac', 'spend', 'purchases'])}
                  insight={summary.data?.change?.cac != null ? `CAC ${movement(summary.data.change.cac)} ${range.comparisonLabel}.` : null}
                >
                  <TrendChart data={points} granularity={granularity} format="currency" series={[{ key: 'cac', label: 'CAC', color: SERIES[1] }]} />
                </ChartCard>
                <ChartCard
                  title="Return on ad spend"
                  value={fmtMetric('roas', current?.roas)}
                  height={200}
                  {...chartState}
                  table={seriesTable(points, granularity, ['roas', 'revenue', 'spend'])}
                >
                  <TrendChart
                    data={points}
                    granularity={granularity}
                    format="ratio"
                    reference={{ value: 1, label: '1.0x' }}
                    series={[{ key: 'roas', label: 'ROAS', color: SERIES[0] }]}
                  />
                </ChartCard>
              </div>
            </Section>

            <Section
              title="Experiment performance"
              description={
                experiments.isSuccess
                  ? `${plural(experimentItems.length, 'experiment')} with activity in this period${running ? ` · ${running} running` : ''}`
                  : null
              }
              actions={
                <ButtonLink to="/experiments" size="sm" variant="ghost">
                  All experiments
                </ButtonLink>
              }
            >
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChartCard
                  title="Spend vs purchases"
                  subtitle="Each dot is an experiment"
                  height={280}
                  {...experimentState}
                  table={{
                    rowKey: '_id',
                    columns: [{ key: 'name', header: 'Experiment' }, moneyColumn('spend', 'Spend'), metricColumn('purchases'), metricColumn('cac')],
                    rows: experimentItems,
                  }}
                >
                  <ScatterPlot
                    data={experimentItems}
                    x={{ key: 'spend', label: 'Ad spend', format: 'currency' }}
                    y={{ key: 'purchases', label: 'Purchases', format: 'number' }}
                    extraRows={(x) => [
                      { label: 'CAC', value: fmtMetric('cac', x.cac) },
                      { label: 'Product', value: x.product?.name ?? '' },
                    ]}
                  />
                </ChartCard>
                <ChartCard
                  title={`${METRICS[experimentMetric].label} by experiment`}
                  subtitle={betterHint(experimentMetric)}
                  height={null}
                  {...experimentState}
                  empty={!rankedExperiments.length}
                  toolbar={
                    <SegmentedControl
                      size="sm"
                      label="Metric"
                      options={metricOptions(EXPERIMENT_METRICS)}
                      value={experimentMetric}
                      onChange={setExperimentMetric}
                    />
                  }
                  table={rankTable(rankedExperiments, experimentMetric, 'Experiment')}
                >
                  <BarList
                    format={METRICS[experimentMetric].format}
                    labelWidth="13rem"
                    items={rankedExperiments.map((x) => ({
                      key: x._id,
                      label: x.name,
                      value: x[experimentMetric],
                      href: `/experiments/${x._id}`,
                    }))}
                  />
                </ChartCard>
              </div>
            </Section>

            <Section title="Pipeline and activity">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChartCard
                  title="Lifecycle"
                  subtitle="Ideas and products by stage"
                  height={null}
                  loading={lifecycle.isPending}
                  fetching={lifecycle.isFetching}
                  error={lifecycle.error}
                  onRetry={lifecycle.refetch}
                  table={{ rowKey: 'status', rows: stages.map((s) => ({ ...s, label: LABELS.status[s.status] })), columns: STAGE_COLUMNS }}
                  insight={
                    sharedStages.length > 0 &&
                    sharedStages.map((s, i) => (
                      <span key={s.status}>
                        {i > 0 && ' · '}
                        {LABELS.status[s.status]} also has{' '}
                        <Link to={`/ideas?status=${s.status}`} className="text-ink hover:underline">
                          {plural(s.ideas, 'idea')}
                        </Link>
                      </span>
                    ))
                  }
                >
                  <BarList
                    format="number"
                    labelWidth="9rem"
                    items={stages.map((s) => ({
                      key: s.status,
                      label: LABELS.status[s.status],
                      value: s.count,
                      display: s.products && s.ideas ? `${fmtNumber(s.products)} + ${plural(s.ideas, 'idea')}` : undefined,
                      muted: s.status === 'paused' || s.status === 'killed',
                      href: stageLink(s),
                      prefix: <Dot color={statusMeta('status', s.status).color} />,
                    }))}
                  />
                </ChartCard>
                <Card className="min-w-0 p-4 sm:p-5 lg:col-span-2">
                  <CardHeader title="Recent activity" subtitle="Latest changes across products" className="mb-4" />
                  <ActivityFeed query={activity} />
                </Card>
              </div>
            </Section>
          </>
        )}
      </div>

      <MetricEntryModal open={recording} onClose={() => setRecording(false)} defaults={{ productId }} />
    </>
  );
}
