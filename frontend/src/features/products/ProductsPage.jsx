import { useState } from 'react';
import { Package, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { LABELS, PRODUCT_STATUSES } from '@product-lab/shared/constants';
import { BarList } from '../../components/charts/BarList.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { CHART, METRIC_COLORS, MUTED, SERIES } from '../../components/charts/palette.js';
import { Dot, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DateRangePicker } from '../../components/ui/DateRangePicker.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { choices, DASH, fmtCurrency, fmtDate, fmtMetric, fmtRange, plural } from '../../lib/format.js';
import { useAnalytics, useList } from '../../lib/queries.js';
import { statusMeta } from '../../lib/status.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { ProductFormModal } from './ProductFormModal.jsx';
import { productBreakEven, standing } from './productMetrics.js';
import { ProductTabs } from './ProductTabs.jsx';

const PARKED = ['paused', 'killed'];
const STATUS_OPTIONS = choices(PRODUCT_STATUSES, LABELS.status);
const VIEWS = [
  { value: 'cards', label: 'Cards' },
  { value: 'table', label: 'Table' },
];
const STATS = [
  ['purchases', 'Purchases'],
  ['cac', 'CAC'],
  ['roas', 'ROAS'],
  ['contribution', 'Contribution'],
];
const METRIC_COLUMNS = [
  ['revenue', 'Revenue'],
  ['spend', 'Ad spend'],
  ['purchases', 'Purchases'],
  ['cac', 'CAC'],
  ['roas', 'ROAS'],
  ['contribution', 'Contribution'],
  ['contributionMargin', 'Margin'],
];
const COLUMNS = [
  {
    key: 'name',
    header: 'Product',
    render: (p) => (
      <Link to={`/products/${p._id}`} className="font-medium whitespace-nowrap text-ink hover:underline">
        {p.name}
      </Link>
    ),
  },
  { key: 'status', header: 'Status', render: (p) => <StatusBadge value={p.status} />, sortValue: (p) => PRODUCT_STATUSES.indexOf(p.status) },
  { key: 'category', header: 'Category', className: 'text-body' },
  { key: 'version', header: 'Version', className: 'text-body' },
  { key: 'price', header: 'Price', align: 'right', format: (v) => fmtCurrency(v) },
  ...METRIC_COLUMNS.map(([key, header]) => ({
    key,
    header,
    align: 'right',
    render: (p) => <span className={p[key] < 0 ? 'text-negative' : ''}>{p.hasData ? fmtMetric(key, p[key]) : DASH}</span>,
  })),
];

const byRevenue = (a, b) => (b.revenue ?? 0) - (a.revenue ?? 0) || PRODUCT_STATUSES.indexOf(a.status) - PRODUCT_STATUSES.indexOf(b.status);

function Pipeline({ counts, value, onChange }) {
  const max = Math.max(1, ...Object.values(counts));
  return (
    <Card className="mb-5 p-1.5">
      <ul className="grid grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-8">
        {PRODUCT_STATUSES.map((s) => {
          const active = value === s;
          const count = counts[s] ?? 0;
          return (
            <li key={s} className="min-w-0">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? '' : s)}
                className={`w-full rounded-md px-3 py-2.5 text-left transition-colors ${active ? 'bg-tint' : 'hover:bg-tint/60'}`}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                  <Dot color={statusMeta('status', s).color} />
                  <span className="truncate">{LABELS.status[s]}</span>
                </span>
                <span className="mt-1 block text-xl leading-7 font-semibold text-ink">{count}</span>
                <span className="mt-1.5 block h-1 overflow-hidden rounded-full" style={{ backgroundColor: CHART.grid }}>
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(count / max) * 100}%`, backgroundColor: PARKED.includes(s) ? MUTED : SERIES[0] }}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CardMetrics({ product: p, max }) {
  const { breakEvenCac, targetCac } = productBreakEven(p, p);
  const [tone, state] = standing(p.cac, { target: targetCac, limit: breakEvenCac }, true) ?? [];
  return (
    <>
      <BarList
        max={max}
        labelWidth="4.5rem"
        items={[
          { key: 'revenue', label: 'Revenue', value: p.revenue, color: METRIC_COLORS.revenue },
          { key: 'spend', label: 'Ad spend', value: p.spend, color: METRIC_COLORS.spend },
        ]}
      />
      <dl className="mt-4 grid grid-cols-2 gap-x-2 gap-y-3 border-t border-hairline-soft pt-3 @[19.5rem]:grid-cols-4">
        {STATS.map(([key, label]) => (
          <div key={key} className="min-w-0">
            <dt className="truncate text-xs text-muted">{label}</dt>
            <dd className={`mt-0.5 truncate text-[13px] font-semibold tabular-nums ${key === 'contribution' && p[key] < 0 ? 'text-negative' : 'text-ink'}`}>
              {fmtMetric(key, p[key])}
            </dd>
          </div>
        ))}
      </dl>
      {tone && (
        <div className="mt-auto pt-4">
          <Meter
            height={6}
            value={p.cac}
            max={Math.max(p.cac, breakEvenCac) * 1.25}
            tone={tone}
            marker={{ value: breakEvenCac, label: `Break-even ${fmtCurrency(breakEvenCac)}` }}
            label={`CAC ${state}`}
            valueLabel={fmtCurrency(p.cac)}
          />
        </div>
      )}
    </>
  );
}

function Idle({ product: p }) {
  if (p.status === 'killed') {
    return (
      <p className="line-clamp-3 text-[13px] text-muted">
        <span className="font-medium text-body">Killed {fmtDate(p.killedAt ?? p.statusChangedAt, { year: true })}</span>
        {p.killReason && ` · ${p.killReason}`}
      </p>
    );
  }
  return (
    <>
      {p.description && <p className="line-clamp-2 text-[13px] text-body">{p.description}</p>}
      <p className="mt-auto pt-4 text-[13px] text-muted">
        {LABELS.status[p.status]} since {fmtDate(p.statusChangedAt ?? p.createdAt)} · no ad data in this period
      </p>
    </>
  );
}

function ProductCard({ product: p, max, loading }) {
  return (
    <Card as="article" className="relative flex min-w-0 flex-col p-4 transition-shadow hover:shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-ink">
            <Link to={`/products/${p._id}`} className="after:absolute after:inset-0 after:z-10 after:rounded-lg hover:underline">
              {p.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[13px] text-muted">{[p.category, fmtCurrency(p.price), p.version].filter(Boolean).join(' · ')}</p>
        </div>
        <StatusBadge value={p.status} />
      </div>
      <div className="@container mt-4 flex flex-1 flex-col">
        {loading ? <Skeleton className="h-36" /> : p.hasData ? <CardMetrics product={p} max={max} /> : <Idle product={p} />}
      </div>
    </Card>
  );
}

export default function ProductsPage() {
  const range = useDateRange();
  const navigate = useNavigate();
  const search = useSearchParamState();
  const [creating, setCreating] = useState(false);
  const q = search.get('q');
  const status = PRODUCT_STATUSES.includes(search.get('status')) ? search.get('status') : '';
  const category = search.get('category');
  const view = search.get('view') === 'table' ? 'table' : 'cards';
  const filtered = Boolean(q || status || category);

  const list = useList('products', { q: q || undefined, status: status || undefined, category: category || undefined });
  const analytics = useAnalytics('products', range.params);
  const lifecycle = useAnalytics('lifecycle');
  const stages = lifecycle.data?.stages ?? [];
  const counts = Object.fromEntries(stages.map((s) => [s.status, s.products]));
  const total = stages.reduce((n, s) => n + s.products, 0);
  const metrics = new Map((analytics.data?.items ?? []).map((m) => [m._id, m]));
  const rows = (list.data?.items ?? []).map((p) => ({ ...metrics.get(p._id), ...p })).sort(byRevenue);
  const max = Math.max(0, ...rows.map((r) => Math.max(r.revenue ?? 0, r.spend ?? 0)));
  const dim = analytics.isFetching || list.isFetching ? 'opacity-60' : '';
  const clearFilters = () => search.clear(['view']);

  return (
    <>
      <PageHeader
        title="Products"
        description={`Metrics for ${range.range.from ? fmtRange(range.range) : 'all time'}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New product
          </Button>
        }
      />
      <ProductTabs />
      <FilterBar>
        <DateRangePicker />
        <SearchInput value={q} onChange={(v) => search.set('q', v)} placeholder="Search products" />
        <Select
          aria-label="Status"
          className="w-full sm:w-44"
          value={status}
          onChange={(e) => search.set('status', e.target.value)}
          placeholder="All statuses"
          options={STATUS_OPTIONS}
        />
        <Select
          aria-label="Category"
          className="w-full sm:w-44"
          value={category}
          onChange={(e) => search.set('category', e.target.value)}
          placeholder="All categories"
          options={list.data?.facets?.categories ?? []}
        />
      </FilterBar>

      {lifecycle.isPending ? (
        <Skeleton className="mb-5 h-[92px]" />
      ) : lifecycle.error ? (
        <Card className="mb-5">
          <ErrorState error={lifecycle.error} onRetry={lifecycle.refetch} compact />
        </Card>
      ) : (
        <Pipeline counts={counts} value={status} onChange={(s) => search.set('status', s)} />
      )}
      {analytics.error && (
        <Card className="mb-5">
          <ErrorState error={analytics.error} onRetry={analytics.refetch} compact />
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {list.data ? `${plural(rows.length, 'product')}${filtered && lifecycle.data ? ` of ${total}` : ''}` : ' '}
        </p>
        <SegmentedControl size="sm" label="View" options={VIEWS} value={view} onChange={(v) => search.set('view', v === 'table' ? v : '')} />
      </div>

      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={list.refetch} />
        </Card>
      ) : list.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : !rows.length ? (
        <Card>
          {filtered ? (
            <EmptyState
              title="No products match these filters."
              description="Try another status, category or search."
              action={
                <Button size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Package}
              title="No products yet."
              description="Convert a validated idea or add a product to start testing it."
              action={
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  New product
                </Button>
              }
            />
          )}
        </Card>
      ) : view === 'table' ? (
        <Card className={`min-w-0 overflow-hidden transition-opacity ${dim}`}>
          <DataTable columns={COLUMNS} rows={rows} initialSort={{ key: 'revenue', dir: 'desc' }} onRowClick={(p) => navigate(`/products/${p._id}`)} />
        </Card>
      ) : (
        <div className={`grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${dim}`}>
          {rows.map((p) => (
            <ProductCard key={p._id} product={p} max={max} loading={analytics.isPending} />
          ))}
        </div>
      )}

      <ProductFormModal open={creating} onClose={() => setCreating(false)} onSaved={(p) => navigate(`/products/${p._id}`)} />
    </>
  );
}
