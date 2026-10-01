import { useRef, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { percent } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Heatmap } from '../../components/charts/Heatmap.jsx';
import { KpiTile } from '../../components/charts/KpiTile.jsx';
import { SERIES } from '../../components/charts/palette.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DateRangePicker, GranularityControl } from '../../components/ui/DateRangePicker.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { PAGE_SIZE, PagedList, usePaging } from '../../components/ui/PagedList.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtCurrency, fmtDate, fmtNumber, fmtPercent, fmtRange } from '../../lib/format.js';
import { moneyColumn, periodColumn } from '../../lib/metricDisplay.js';
import { useAnalytics, useList } from '../../lib/queries.js';
import { OrderFormModal } from '../orders/OrderFormModal.jsx';
import { CustomerModal } from './CustomerModal.jsx';

const SORTS = [
  { value: '-totalSpent', label: 'Top spenders' },
  { value: '-lastPurchaseAt', label: 'Most recent' },
  { value: '-orderCount', label: 'Most orders' },
  { value: 'name', label: 'Name' },
];
const PER = { day: 'per day', week: 'per week', month: 'per month' };
const half = 'w-[calc(50%-0.25rem)] sm:w-48';
const note = (text) => <span className="ml-1.5 text-[13px] font-medium tracking-normal text-muted">{text}</span>;

const COLUMNS = [
  {
    key: 'name',
    header: 'Customer',
    render: (c) => (
      <div className="max-w-60 min-w-0">
        <Link to={`?customer=${c._id}`} replace className="block truncate font-medium text-ink hover:underline">
          {c.name || c.email}
        </Link>
        {c.name && <div className="truncate text-xs text-muted">{c.email}</div>}
      </div>
    ),
  },
  {
    key: 'products',
    header: 'Products',
    render: (c) =>
      c.products.length ? (
        <div className="flex max-w-80 flex-wrap gap-1">
          {c.products.slice(0, 2).map((p) => (
            <Badge key={p._id}>{p.name}</Badge>
          ))}
          {c.products.length > 2 && <Badge>+{c.products.length - 2}</Badge>}
        </div>
      ) : (
        <span className="text-faint">{DASH}</span>
      ),
  },
  moneyColumn('totalSpent', 'Total spent'),
  { key: 'orderCount', header: 'Orders', align: 'right', format: (v) => fmtNumber(v) },
  { key: 'firstPurchaseAt', header: 'First purchase', className: 'whitespace-nowrap', format: (v) => fmtDate(v, { year: true }) },
  { key: 'lastPurchaseAt', header: 'Last purchase', className: 'whitespace-nowrap', format: (v) => fmtDate(v, { year: true }) },
].map((c) => ({ ...c, sortable: false }));

function overlapView({ products, matrix }) {
  const keep = products.map((_, i) => i).filter((i) => matrix[i].some((v, j) => j !== i && v > 0));
  return {
    labels: keep.map((i) => products[i].name),
    matrix: keep.map((i) => keep.map((j) => (i === j ? 0 : matrix[i][j]))),
    pairs: keep
      .flatMap((i, x) => keep.slice(x + 1).map((j) => ({ key: `${i}-${j}`, a: products[i].name, b: products[j].name, both: matrix[i][j] })))
      .filter((p) => p.both > 0),
  };
}

export default function CustomersPage() {
  const range = useDateRange();
  const [params, setParams] = useSearchParams();
  const tableRef = useRef(null);
  const [q, setQ] = useState('');
  const [productId, setProductId] = useState('');
  const [sort, setSort] = useState('-totalSpent');
  const [adding, setAdding] = useState(false);

  const analytics = useAnalytics('customers', range.params);
  const products = useList('products', { sort: 'name' });
  const listParams = { q: q || undefined, productId: productId || undefined, sort };
  const [offset, setOffset] = usePaging(listParams);
  const customers = useList('customers', { ...listParams, limit: PAGE_SIZE, offset });

  const data = analytics.data;
  const t = data?.totals;
  const series = data?.newCustomers.series ?? [];
  const granularity = data?.newCustomers.granularity ?? range.granularity;
  const newTotal = series.reduce((sum, p) => sum + p.customers, 0);
  const owned = (data?.productsOwned ?? []).map((b) => ({
    ...b,
    label: b.bucket === '1' ? '1 product' : `${b.bucket} products`,
    share: percent(b.count, t?.customers),
  }));
  const overlap = overlapView(data?.overlap ?? { products: [], matrix: [] });
  const top = data?.topCustomers ?? [];
  const multiShare = percent(t?.multiProductCustomers, t?.customers);
  const filtered = Boolean(q || productId);
  const state = { loading: analytics.isPending, fetching: analytics.isFetching, error: analytics.error, onRetry: analytics.refetch };
  const noCustomers = analytics.isSuccess && !t.customers;

  const openCustomer = (id) => setParams({ customer: id }, { replace: true });
  const goTo = (next) => {
    setOffset(next);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const clearFilters = () => {
    setQ('');
    setProductId('');
  };

  const customerId = params.get('customer');
  const modal = <CustomerModal open={Boolean(customerId)} id={customerId} onClose={() => setParams({}, { replace: true })} />;

  if (noCustomers && customers.isSuccess && !customers.data.total && !filtered) {
    return (
      <>
        <PageHeader title="Customers" />
        <Card>
          <EmptyState
            icon={Users}
            title="No customers yet."
            description="Customers appear here as soon as their first order is recorded."
            action={
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Record an order
              </Button>
            }
          />
        </Card>
        <OrderFormModal open={adding} onClose={() => setAdding(false)} />
        {modal}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description={range.range.from ? `Customers with a paid order · ${fmtRange(range.range)}` : 'Lifetime view of everyone who bought, across all products'}
      />
      <FilterBar>
        <DateRangePicker />
        <GranularityControl />
      </FilterBar>

      {analytics.error ? (
        <Card>
          <ErrorState error={analytics.error} onRetry={analytics.refetch} />
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Paying customers" value={fmtNumber(t?.customers)} loading={analytics.isPending} />
          <KpiTile
            label="Repeat rate"
            value={
              <>
                {fmtPercent(t?.repeatRate)}
                {note(`${fmtNumber(t?.repeatCustomers)} repeat`)}
              </>
            }
            loading={analytics.isPending}
          />
          <KpiTile
            label="Multi-product"
            value={
              <>
                {fmtNumber(t?.multiProductCustomers)}
                {note(fmtPercent(multiShare))}
              </>
            }
            loading={analytics.isPending}
          />
          <KpiTile label="Avg. customer value" value={fmtCurrency(t?.avgValue)} loading={analytics.isPending} />
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="New customers"
          subtitle={`First paid purchase ${PER[granularity]} · ${range.label}`}
          value={data && range.range.from ? fmtNumber(newTotal) : null}
          height={270}
          {...state}
          empty={analytics.isSuccess && !newTotal}
          emptyMessage={range.range.from ? 'No new customers in this period.' : 'Pick a date range to chart new customers.'}
          emptyAction={
            range.range.from ? null : (
              <Button size="sm" onClick={() => range.setPreset('90d')}>
                Show last 90 days
              </Button>
            )
          }
          table={{
            rowKey: 'key',
            columns: [periodColumn(granularity), { key: 'customers', header: 'New customers', align: 'right', format: (v) => fmtNumber(v) }],
            rows: series,
          }}
        >
          <ColumnChart data={series} granularity={granularity} series={[{ key: 'customers', label: 'New customers', color: SERIES[0] }]} />
        </ChartCard>
        <ChartCard
          title="Top customers"
          subtitle={range.range.from ? 'Spend in this period, net of refunds' : 'Lifetime spend, net of refunds'}
          height={null}
          {...state}
          empty={analytics.isSuccess && !top.length}
          emptyMessage="No paying customers yet."
          table={{
            rowKey: '_id',
            columns: [
              { key: 'name', header: 'Customer', format: (v, c) => v || c.email },
              { key: 'orderCount', header: 'Orders', align: 'right', format: (v) => fmtNumber(v) },
              { key: 'products', header: 'Products', align: 'right', format: (v) => fmtNumber(v) },
              moneyColumn('totalSpent', 'Spent'),
            ],
            rows: top,
          }}
        >
          <BarList
            labelWidth="9rem"
            items={top.map((c) => ({ key: c._id, label: c.name || c.email, value: c.totalSpent, href: `/customers?customer=${c._id}` }))}
          />
        </ChartCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard
          className="xl:col-span-2"
          title="Product overlap"
          subtitle="Customers who bought both products"
          height={null}
          {...state}
          empty={analytics.isSuccess && !overlap.pairs.length}
          emptyMessage="No customer has bought two different products yet."
          table={{
            rowKey: 'key',
            columns: [
              { key: 'a', header: 'Product' },
              { key: 'b', header: 'Also bought' },
              { key: 'both', header: 'Customers', align: 'right', format: (v) => fmtNumber(v) },
            ],
            rows: overlap.pairs,
          }}
        >
          <Heatmap labels={overlap.labels} matrix={overlap.matrix} caption="Customers who bought both products" />
        </ChartCard>
        <ChartCard
          title="Products owned"
          subtitle="Share of paying customers by products bought"
          height={null}
          {...state}
          empty={noCustomers}
          emptyMessage="No paying customers yet."
          table={{
            rowKey: 'bucket',
            columns: [
              { key: 'label', header: 'Products' },
              { key: 'count', header: 'Customers', align: 'right', format: (v) => fmtNumber(v) },
              { key: 'share', header: 'Share', align: 'right', format: (v) => fmtPercent(v) },
            ],
            rows: owned,
          }}
        >
          <BarList
            format="number"
            labelWidth="6rem"
            items={owned.map((b) => ({
              key: b.bucket,
              label: b.label,
              value: b.count,
              display: `${fmtNumber(b.count)} · ${fmtPercent(b.share)}`,
            }))}
          />
          <p className="mt-4 text-[13px] leading-snug text-muted">
            {t?.multiProductCustomers
              ? `${fmtNumber(t.multiProductCustomers)} customers (${fmtPercent(multiShare)}) came back for another product.`
              : 'Every customer owns a single product so far.'}
          </p>
        </ChartCard>
      </div>

      <div ref={tableRef} className="scroll-mt-16">
        <Section title="All customers" description="Lifetime totals, not filtered by the date range · click a customer for their orders">
          <FilterBar>
            <SearchInput value={q} onChange={setQ} placeholder="Search name or email" />
            <Select
              aria-label="Product owned"
              className={half}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="Any product"
              options={(products.data?.items ?? []).map((p) => ({ value: p._id, label: p.name }))}
            />
            <Select aria-label="Sort customers" className={half} value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} />
          </FilterBar>
          <Card className="min-w-0 overflow-hidden">
            <PagedList
              query={customers}
              offset={offset}
              onPage={goTo}
              empty={
                <EmptyState
                  title={filtered ? 'No customers match.' : 'No customers yet.'}
                  description={filtered ? 'Try another name or product.' : 'Customers appear with their first order.'}
                  action={
                    filtered ? (
                      <Button size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : null
                  }
                />
              }
            >
              <DataTable columns={COLUMNS} rows={customers.data?.items ?? []} onRowClick={(c) => openCustomer(c._id)} />
            </PagedList>
          </Card>
        </Section>
      </div>

      {modal}
    </>
  );
}
