import { useState } from 'react';
import { FlaskConical, GitCompareArrows, Plus, TriangleAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { EXPERIMENT_VARIABLES, LABELS, METRICS, SMALL_SAMPLE_PURCHASES } from '@product-lab/shared/constants';
import { deriveMetrics, sumTotals } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Stat } from '../../components/ui/Card.jsx';
import { DateRangePicker } from '../../components/ui/DateRangePicker.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl, Tabs } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtCurrency, fmtMetric, fmtNumber, fmtPercent, fmtRange, fmtRatio, plural } from '../../lib/format.js';
import { betterHint, metricColumn, metricOptions, ranked, shortLabel } from '../../lib/metricDisplay.js';
import { useAnalytics, useList } from '../../lib/queries.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { ExperimentFormModal } from './ExperimentFormModal.jsx';
import { MAX_COMPARE, byStart, experimentDates, fmtVariable, isSmallSample, mutedFor } from './ExperimentParts.jsx';

const STATUS_TABS = ['running', 'planned', 'completed', 'stopped'];
const RANK_METRICS = ['cac', 'roas', 'conversionRate', 'revenue', 'purchases'];
const ROW_METRICS = ['spend', 'purchases', 'cac', 'roas', 'conversionRate'];
const CHIPS = EXPERIMENT_VARIABLES.filter((v) => ['price', 'offer', 'angle', 'audience'].includes(v.key));
const ROW_GRID = 'lg:grid-cols-[1rem_minmax(0,1fr)_repeat(5,6.5rem)]';

function useFilters() {
  const params = useSearchParamState();
  const status = params.get('status');
  return {
    q: params.get('q'),
    productId: params.get('productId'),
    campaign: params.get('campaign'),
    status: STATUS_TABS.includes(status) ? status : '',
    set: params.set,
    clear: () => params.clear(),
  };
}

function Summary({ rows, loading }) {
  const t = deriveMetrics(sumTotals(rows.filter((r) => r.hasData)));
  const running = rows.filter((r) => r.status === 'running').length;
  const stats = [
    { label: 'Running', value: fmtNumber(running), sub: `of ${plural(rows.length, 'experiment')}` },
    { label: 'Ad spend', value: fmtCurrency(t.spend), sub: `${fmtCurrency(t.revenue)} revenue` },
    { label: 'Purchases', value: fmtNumber(t.purchases), sub: `${fmtPercent(t.conversionRate)} conversion rate` },
    { label: 'Blended CAC', value: fmtMetric('cac', t.cac), sub: `ROAS ${fmtRatio(t.roas)}` },
  ];
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-hairline-soft md:grid-cols-4">
        {stats.map((s) => (
          <Stat
            key={s.label}
            label={s.label}
            value={loading ? <Skeleton className="h-6 w-20" /> : s.value}
            sub={loading ? <Skeleton className="h-4 w-24" /> : s.sub}
            className="bg-canvas px-4 py-3.5 sm:px-5"
          />
        ))}
      </div>
    </Card>
  );
}

function Ranking({ rows, loading, fetching }) {
  const [metric, setMetric] = useState('cac');
  const items = ranked(rows, metric);
  const extra = metric === 'spend' || metric === 'purchases' ? [] : [metric];
  const note = items.some((x) => mutedFor(metric, x)) ? ` · grey bars have fewer than ${SMALL_SAMPLE_PURCHASES} purchases` : '';
  return (
    <ChartCard
      className="mt-4"
      title={`${METRICS[metric].label} by experiment`}
      subtitle={`${betterHint(metric)}${note}`}
      height={null}
      loading={loading}
      fetching={fetching}
      empty={!items.length}
      emptyMessage="No experiment metrics in this period."
      toolbar={<SegmentedControl size="sm" label="Metric" options={metricOptions(RANK_METRICS)} value={metric} onChange={setMetric} />}
      table={{
        rowKey: '_id',
        rows: items,
        columns: [
          { key: 'name', header: 'Experiment' },
          { key: 'productName', header: 'Product' },
          ...['spend', 'purchases', ...extra].map((k) => metricColumn(k)),
        ],
      }}
    >
      <BarList
        format={METRICS[metric].format}
        labelWidth="min(15rem, 34vw)"
        items={items.map((x) => ({
          key: x._id,
          label: x.name,
          value: x[metric],
          href: `/experiments/${x._id}`,
          muted: mutedFor(metric, x),
        }))}
      />
    </ChartCard>
  );
}

function MetricCell({ metric, row, max }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted lg:hidden">{shortLabel(metric)}</div>
      <div className="truncate text-[13px] font-medium text-ink tabular-nums">{fmtMetric(metric, row[metric])}</div>
      <div className="mt-1.5" aria-hidden>
        <Meter value={row[metric] ?? 0} max={max[metric]} height={4} tone={mutedFor(metric, row) ? 'muted' : 'default'} />
      </div>
    </div>
  );
}

function ExperimentRow({ row, max, metricsLoading, noMetrics, checked, disabled, onToggle }) {
  const chips = CHIPS.filter((c) => String(row.variables?.[c.key] ?? '').trim());
  const creatives = row.creativeCount ? ` · ${plural(row.creativeCount, 'creative')}` : '';
  return (
    <li
      className={`grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 px-4 py-4 sm:px-5 lg:items-center ${ROW_GRID} ${checked ? 'bg-tint/40' : ''}`}
    >
      <input
        type="checkbox"
        className="mt-1 size-4 cursor-pointer rounded-sm accent-primary disabled:cursor-not-allowed lg:mt-0"
        checked={checked}
        disabled={disabled}
        onChange={onToggle}
        aria-label={`Select ${row.name} to compare`}
      />
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={`/experiments/${row._id}`} className="min-w-0 truncate text-sm font-medium text-ink hover:underline">
            {row.name}
          </Link>
          <StatusBadge kind="experimentStatus" value={row.status} />
          {isSmallSample(row) && (
            <span
              className="inline-flex items-center gap-1 text-xs text-warning"
              title={`Fewer than ${SMALL_SAMPLE_PURCHASES} purchases: differences may be noise`}
            >
              <TriangleAlert className="size-3" aria-hidden />
              Small sample
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">
          {row.productName} · {experimentDates(row)}
          {creatives}
        </p>
        {chips.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <li key={c.key} className="flex max-w-full min-w-0 items-center gap-1 rounded-full bg-tint px-2 py-0.5 text-xs">
                <span className="shrink-0 text-body">{c.label}</span>
                <span className="truncate text-ink">{fmtVariable(c.key, row.variables[c.key])}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="col-start-2 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:contents">
        {metricsLoading ? (
          ROW_METRICS.map((k) => <Skeleton key={k} className="h-8" />)
        ) : row.hasData ? (
          ROW_METRICS.map((k) => <MetricCell key={k} metric={k} row={row} max={max} />)
        ) : (
          <p className="col-span-3 text-xs text-muted sm:col-span-5">{noMetrics}</p>
        )}
      </div>
    </li>
  );
}

function CompareBar({ selected, onClear }) {
  const navigate = useNavigate();
  const ready = selected.length >= 2;
  const ids = [...selected].sort(byStart).map((x) => x._id).join(',');
  return (
    <div className="sticky bottom-4 z-10 mt-4 flex justify-center">
      <div className="flex max-w-full flex-wrap items-center justify-center gap-2 rounded-lg border border-hairline bg-canvas py-1.5 pr-1.5 pl-3.5 shadow-md">
        <span className="text-[13px] text-body">
          {!ready
            ? 'Select one more to compare'
            : selected.length === MAX_COMPARE
              ? `${MAX_COMPARE} selected · the maximum`
              : `${selected.length} selected`}
        </span>
        <Button size="sm" variant="ghost" onClick={onClear}>
          Clear
        </Button>
        <Button
          size="sm"
          variant="primary"
          icon={GitCompareArrows}
          disabled={!ready}
          onClick={() => navigate(`/experiments/compare?ids=${ids}`)}
        >
          Compare ({selected.length})
        </Button>
      </div>
    </div>
  );
}

export default function ExperimentsPage() {
  const navigate = useNavigate();
  const range = useDateRange();
  const filters = useFilters();
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);

  const scoped = { productId: filters.productId || undefined, campaign: filters.campaign || undefined };
  const list = useList('experiments', { ...scoped, q: filters.q || undefined });
  const analytics = useAnalytics('experiments', { from: range.params.from, to: range.params.to, ...scoped });
  const products = useList('products', { sort: 'name' });

  const metrics = new Map((analytics.data?.items ?? []).map((x) => [x._id, x]));
  const all = (list.data?.items ?? []).map((x) => ({ ...x, ...metrics.get(x._id) }));
  const rows = filters.status ? all.filter((x) => x.status === filters.status) : all;
  const withData = rows.filter((x) => x.hasData);
  const loading = list.isPending || analytics.isPending;
  const max = Object.fromEntries(ROW_METRICS.map((k) => [k, Math.max(0, ...withData.map((x) => x[k] ?? 0))]));
  const hasFilters = Boolean(filters.q || filters.productId || filters.campaign || filters.status);
  const product = products.data?.items.find((p) => p._id === filters.productId);
  const rangeLabel = fmtRange(range.range);
  const isSelected = (id) => selected.some((x) => x._id === id);
  const toggle = (row) => setSelected((s) => (s.some((x) => x._id === row._id) ? s.filter((x) => x._id !== row._id) : [...s, row]));
  const noMetrics = analytics.error ? 'Metrics unavailable' : range.range.from ? 'No metrics in this period' : 'No metrics recorded yet';

  const tabs = [
    { value: '', label: 'All', count: list.data ? all.length : undefined },
    ...STATUS_TABS.map((s) => ({
      value: s,
      label: LABELS.experimentStatus[s],
      count: list.data ? all.filter((x) => x.status === s).length : undefined,
    })),
  ];
  const newButton = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      New experiment
    </Button>
  );
  const modal = <ExperimentFormModal open={creating} onClose={() => setCreating(false)} onSaved={(x) => navigate(`/experiments/${x._id}`)} />;

  if (list.isSuccess && !hasFilters && !all.length) {
    return (
      <>
        <PageHeader title="Experiments" actions={newButton} />
        <Card>
          <EmptyState
            icon={FlaskConical}
            title="No experiments yet."
            description="Create one for a product to record what you change and compare what it returns."
            action={newButton}
          />
        </Card>
        {modal}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Experiments"
        description={`${product ? product.name : 'All products'} · metrics for ${rangeLabel}`}
        actions={newButton}
      />
      <FilterBar>
        <DateRangePicker />
        <SearchInput value={filters.q} onChange={(v) => filters.set('q', v)} placeholder="Search experiments" />
        <Select
          aria-label="Product"
          className="w-full sm:w-52"
          value={filters.productId}
          onChange={(e) => filters.set('productId', e.target.value)}
          placeholder="All products"
          options={(products.data?.items ?? []).map((p) => ({ value: p._id, label: p.name }))}
        />
        <Select
          aria-label="Campaign"
          className="w-full sm:w-52"
          value={filters.campaign}
          onChange={(e) => filters.set('campaign', e.target.value)}
          placeholder="All campaigns"
          options={list.data?.facets?.campaigns ?? []}
        />
      </FilterBar>
      <Tabs label="Status" className="mb-5" tabs={tabs} value={filters.status} onChange={(v) => filters.set('status', v)} />

      {list.error || analytics.error ? (
        <Card>
          <ErrorState error={list.error ?? analytics.error} onRetry={list.error ? list.refetch : analytics.refetch} compact={!list.error} />
        </Card>
      ) : (
        <>
          <Summary rows={rows} loading={loading} />
          <Ranking rows={rows} loading={loading} fetching={list.isFetching || analytics.isFetching} />
        </>
      )}

      {!list.error && (
        <Section
          title={filters.status ? `${LABELS.experimentStatus[filters.status]} experiments` : 'All experiments'}
          description={`Tick 2–${MAX_COMPARE} to compare them side by side`}
          actions={
            range.range.from && analytics.isSuccess && rows.some((x) => !x.hasData) ? (
              <Button size="sm" variant="ghost" onClick={() => range.setPreset('all')}>
                Show all-time metrics
              </Button>
            ) : null
          }
        >
          <Card className="min-w-0">
            <div className={`hidden gap-x-3 border-b border-hairline px-5 py-2 text-xs font-medium text-muted lg:grid ${ROW_GRID}`}>
              <span />
              <span>Experiment</span>
              {ROW_METRICS.map((k) => (
                <span key={k}>{shortLabel(k)}</span>
              ))}
            </div>
            {list.isPending ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : !rows.length ? (
              <EmptyState
                compact
                title="No experiments match these filters."
                action={
                  <Button size="sm" onClick={filters.clear}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-hairline-soft">
                {rows.map((row) => (
                  <ExperimentRow
                    key={row._id}
                    row={row}
                    max={max}
                    metricsLoading={analytics.isPending}
                    noMetrics={noMetrics}
                    checked={isSelected(row._id)}
                    disabled={!isSelected(row._id) && selected.length >= MAX_COMPARE}
                    onToggle={() => toggle(row)}
                  />
                ))}
              </ul>
            )}
          </Card>
          {selected.length > 0 && <CompareBar selected={selected} onClear={() => setSelected([])} />}
        </Section>
      )}
      {modal}
    </>
  );
}
