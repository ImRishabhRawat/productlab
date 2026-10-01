import { useState } from 'react';
import { ChartLine, History, Plus, X } from 'lucide-react';
import { previousRange } from '@product-lab/shared/dates';
import { funnel } from '@product-lab/shared/metrics';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { Funnel } from '../../components/charts/Funnel.jsx';
import { KpiGrid } from '../../components/charts/KpiTile.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DateRangePicker, GranularityControl } from '../../components/ui/DateRangePicker.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtNumber, fmtPercent, fmtRange } from '../../lib/format.js';
import { hasActivity, recordedOnly } from '../../lib/metricDisplay.js';
import { useAnalytics, useItem, useList } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { MetricEntryModal } from '../experiments/MetricEntryModal.jsx';
import { CreativeLeaderboard } from './CreativeLeaderboard.jsx';
import { FinancialBreakdown } from './FinancialBreakdown.jsx';
import { ProductComparison } from './ProductComparison.jsx';
import { MetricExplorer, RateCard } from './TrendCards.jsx';

const KPIS = ['revenue', 'spend', 'contribution', 'purchases', 'cac', 'roas', 'aov', 'conversionRate', 'ctr', 'cpc', 'cpm', 'checkoutRate'];
const STEP_RATES = { ctr: 'Clicks ÷ impressions', checkoutRate: 'Checkouts ÷ landing page views', conversionRate: 'Purchases ÷ landing page views' };
const COST_RATES = { cpc: 'Spend ÷ clicks', cpm: 'Spend per 1,000 impressions', cac: 'Spend ÷ purchases' };
const FILTERS = ['productId', 'experimentId', 'campaign'];
const CLEARED = { productId: '', experimentId: '', campaign: '' };

export default function AnalyticsPage() {
  const range = useDateRange();
  const settings = useSettings();
  const search = useSearchParamState();
  const filters = Object.fromEntries(FILTERS.map((k) => [k, search.get(k)]));
  const setFilters = search.setMany;
  const [recording, setRecording] = useState(false);

  const { from, to } = range.params;
  const scope = { productId: filters.productId || undefined, experimentId: filters.experimentId || undefined, campaign: filters.campaign || undefined };
  const prevRange = previousRange(range.range);
  const summary = useAnalytics('summary', { from, to, ...scope });
  const series = useAnalytics('timeseries', { ...range.params, ...scope });
  const prevSeries = useAnalytics('timeseries', { ...prevRange, granularity: 'day', ...scope }, { enabled: Boolean(prevRange) });
  const products = useAnalytics('products', { from, to, campaign: scope.campaign });
  const prevProducts = useAnalytics('products', { ...prevRange, campaign: scope.campaign }, { enabled: Boolean(prevRange) });
  const creatives = useAnalytics('creatives', { from, to, ...scope });
  const experiments = useList('experiments', { productId: scope.productId, campaign: scope.campaign });
  const productDetail = useItem('products', scope.productId);

  const current = summary.data?.current;
  const granularity = series.data?.granularity ?? range.granularity;
  const points = recordedOnly(series.data?.points ?? [], range.today, granularity);
  const productItems = products.data?.items ?? [];
  const experimentItems = experiments.data?.items ?? [];
  const product = productItems.find((p) => p._id === filters.productId);
  const experiment = experimentItems.find((x) => x._id === filters.experimentId);
  const target = scope.productId ? productDetail.data?.desiredMarginPct : settings.data?.defaultDesiredMarginPct;
  const noData = summary.isSuccess && !hasActivity(current);
  const dashedNote = hasActivity(summary.data?.previous) ? ' Dashed lines show the previous period overall.' : '';
  const comparePrevious = Boolean(prevRange && prevProducts.data?.items.some((p) => p.hasData));
  const totalsState = { loading: summary.isPending, fetching: summary.isFetching, error: summary.error, onRetry: summary.refetch };
  const trendState = { loading: series.isPending, fetching: series.isFetching, error: series.error, onRetry: series.refetch };
  const rateProps = { points, granularity, summary, state: trendState };
  const scopeLabel = [product?.name ?? 'All products', experiment?.name ?? filters.campaign].filter(Boolean).join(' › ');

  const pickExperiment = (id) => {
    const x = experimentItems.find((i) => i._id === id);
    setFilters({ experimentId: id, ...(x && { productId: x.productId }) });
  };
  const pickCampaign = (campaign) => setFilters({ campaign, ...(campaign && experiment?.campaign !== campaign && { experimentId: '' }) });

  if (products.isSuccess && !productItems.length) {
    return (
      <>
        <PageHeader title="Analytics" />
        <Card>
          <EmptyState
            icon={ChartLine}
            title="Nothing to analyze yet."
            description="Turn an idea into a product and record its ad metrics to see analytics here."
            action={
              <ButtonLink to="/ideas" variant="primary" icon={Plus}>
                Add an idea
              </ButtonLink>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        meta={product && <StatusBadge value={product.status} />}
        description={`${scopeLabel} · ${fmtRange(range.range)}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setRecording(true)}>
            Record metrics
          </Button>
        }
      />
      <FilterBar>
        <DateRangePicker />
        <GranularityControl />
        <Select
          aria-label="Product"
          className="w-full sm:w-52"
          value={filters.productId}
          onChange={(e) => setFilters({ ...CLEARED, productId: e.target.value })}
          placeholder="All products"
          options={productItems.map((p) => ({ value: p._id, label: p.name }))}
        />
        <Select
          aria-label="Experiment"
          className="w-full sm:w-60"
          value={filters.experimentId}
          onChange={(e) => pickExperiment(e.target.value)}
          placeholder={experiments.error ? 'Experiments unavailable' : 'All experiments'}
          options={experimentItems.map((x) => ({ value: x._id, label: scope.productId ? x.name : `${x.name} — ${x.productName}` }))}
        />
        <Select
          aria-label="Campaign"
          className="w-full sm:w-44"
          value={filters.campaign}
          onChange={(e) => pickCampaign(e.target.value)}
          placeholder="All campaigns"
          options={experiments.data?.facets?.campaigns ?? []}
        />
        {FILTERS.some((k) => filters[k]) && (
          <Button variant="ghost" icon={X} onClick={() => setFilters(CLEARED)}>
            Clear
          </Button>
        )}
      </FilterBar>

      {summary.error ? (
        <Card>
          <ErrorState error={summary.error} onRetry={summary.refetch} />
        </Card>
      ) : noData ? (
        <Card>
          <EmptyState
            icon={ChartLine}
            title="No activity in this period."
            description="No ad metrics were recorded for this selection and date range."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={Plus} onClick={() => setRecording(true)}>
                  Record metrics
                </Button>
                {range.preset !== 'all' && (
                  <Button icon={History} onClick={() => range.setPreset('all')}>
                    Show all time
                  </Button>
                )}
              </div>
            }
          />
        </Card>
      ) : (
        <KpiGrid keys={KPIS} summary={summary} points={points} comparisonLabel={range.comparisonLabel} />
      )}

      {!noData && (
        <>
          <MetricExplorer
            series={series}
            prevSeries={prevRange ? prevSeries : null}
            summary={summary}
            granularity={granularity}
            comparisonLabel={range.comparisonLabel}
          />

          <Section title="Funnel" description={`Where is the funnel breaking?${dashedNote}`}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ChartCard
                title="Conversion funnel"
                subtitle="Share that continues at each step"
                height={null}
                {...totalsState}
                table={{
                  rowKey: 'key',
                  rows: funnel(current).stages,
                  columns: [
                    { key: 'label', header: 'Stage' },
                    { key: 'value', header: 'Count', align: 'right', format: (v) => fmtNumber(v) },
                    { key: 'stepRate', header: 'Continued', align: 'right', format: (v) => fmtPercent(v) },
                  ],
                }}
              >
                <Funnel totals={current} />
              </ChartCard>
              {Object.entries(STEP_RATES).map(([key, note]) => (
                <RateCard key={key} metric={key} note={note} height={240} {...rateProps} />
              ))}
            </div>
          </Section>

          <Section title="Cost efficiency" description={`Is advertising becoming more or less efficient?${dashedNote}`}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {Object.entries(COST_RATES).map(([key, note]) => (
                <RateCard key={key} metric={key} note={note} height={200} {...rateProps} />
              ))}
            </div>
          </Section>

          <Section title="Financial breakdown" description="How revenue turns into contribution">
            <FinancialBreakdown summary={summary} target={target} />
          </Section>

          <Section title="Creative leaderboard" description="Which ads earn their spend">
            <CreativeLeaderboard creatives={creatives} />
          </Section>
        </>
      )}

      {(!noData || productItems.some((p) => p.hasData)) && (
        <Section
          title="Product comparison"
          description={`All products with activity in this period${comparePrevious ? ` · change ${range.comparisonLabel}` : ''}`}
        >
          <ProductComparison products={products} previous={comparePrevious ? prevProducts : null} />
        </Section>
      )}

      <MetricEntryModal open={recording} onClose={() => setRecording(false)} defaults={{ productId: filters.productId, experimentId: filters.experimentId }} />
    </>
  );
}
