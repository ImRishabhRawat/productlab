import { useRef, useState } from 'react';
import { Pencil, Plus, ReceiptText, Trash2 } from 'lucide-react';
import { previousRange } from '@product-lab/shared/dates';
import { pctChange } from '@product-lab/shared/metrics';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { KpiTile } from '../../components/charts/KpiTile.jsx';
import { SERIES } from '../../components/charts/palette.js';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { DateRangePicker, GranularityControl } from '../../components/ui/DateRangePicker.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { FilterBar, PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { PAGE_SIZE, PagedList, usePaging } from '../../components/ui/PagedList.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtCurrency, fmtDate, fmtDateTime, fmtNumber, fmtPercent, fmtRange } from '../../lib/format.js';
import { moneyColumn, periodColumn } from '../../lib/metricDisplay.js';
import { useAnalytics, useList, useRemove } from '../../lib/queries.js';
import { CustomerModal } from '../customers/CustomerModal.jsx';
import { AddOnWaterfall, KindColumns, orderChartState, TakeRates } from './OrderAddOns.jsx';
import { ItemChips, OrderAmount } from './OrderParts.jsx';
import { OPTIONS, OrderFormModal } from './OrderFormModal.jsx';

const SORTS = [
  { value: '-date', label: 'Newest first' },
  { value: 'date', label: 'Oldest first' },
  { value: '-amount', label: 'Largest first' },
];
const NO_SCOPE = { productId: '', experimentId: '', campaign: '' };
const NO_FILTERS = { q: '', paymentStatus: '', refundStatus: '', kind: '' };
const half = 'w-[calc(50%-0.25rem)] sm:w-40';

function OrderKpis({ current, previous, summary, points, loading, comparisonLabel }) {
  const delta = (key) => (previous ? pctChange(current?.[key], previous[key]) : undefined);
  const spark = (key) => (points.length > 2 ? points.map((p) => p[key]) : null);
  const shared = { loading, comparisonLabel: previous ? comparisonLabel : undefined };
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <KpiTile {...shared} label="Orders" value={fmtNumber(current?.orders)} delta={delta('orders')} better="up" spark={spark('orders')} />
      <KpiTile {...shared} metric="revenue" value={current?.revenue} delta={delta('revenue')} spark={spark('revenue')} />
      <KpiTile {...shared} metric="aov" value={current?.aov} delta={delta('aov')} spark={spark('aov')} />
      <KpiTile {...shared} label="Front-end AOV" value={fmtCurrency(current?.frontEndAov)} delta={delta('frontEndAov')} better="up" />
      <KpiTile
        label="Front-end conversion"
        metric="conversionRate"
        value={summary?.current.conversionRate}
        delta={summary?.change?.conversionRate}
        comparisonLabel={summary?.previous ? comparisonLabel : undefined}
        loading={!summary}
      />
      <KpiTile
        {...shared}
        label="Refunds"
        value={
          <>
            {fmtCurrency(current?.refunds)}
            {current?.refundRate != null && (
              <span className="ml-1.5 text-[13px] font-medium tracking-normal text-muted">{fmtPercent(current.refundRate)}</span>
            )}
          </>
        }
        delta={delta('refunds')}
        better="down"
      />
    </div>
  );
}

function deleteMessage(order) {
  const who = order.customer?.name || order.customer?.email || 'a customer';
  return `${fmtCurrency(order.amount)} from ${who} on ${fmtDate(order.date, { year: true })}. Customer totals are recalculated.`;
}

function CustomerCell({ customer, onOpen }) {
  if (!customer) return <span className="text-faint">{DASH}</span>;
  return (
    <div className="max-w-52 min-w-0">
      <button
        type="button"
        onClick={() => onOpen(customer._id)}
        className="block max-w-full truncate text-left font-medium text-ink hover:underline"
      >
        {customer.name || customer.email}
      </button>
      {customer.name && <div className="truncate text-xs text-muted">{customer.email}</div>}
    </div>
  );
}

export default function OrdersPage() {
  const range = useDateRange();
  const toast = useToast();
  const tableRef = useRef(null);
  const [scope, setScope] = useState(NO_SCOPE);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [sort, setSort] = useState('-date');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewing, setViewing] = useState(null);

  const products = useList('products', { sort: 'name' });
  const experiments = useList('experiments', { productId: scope.productId || undefined });
  const prior = previousRange(range.range);
  const analytics = useAnalytics('orders', { ...range.params, ...scope });
  const previous = useAnalytics('orders', { ...prior, ...scope }, { enabled: Boolean(prior) });
  const summary = useAnalytics('summary', { ...range.params, ...scope });
  const listParams = { from: range.params.from, to: range.params.to, ...scope, ...filters, sort };
  const [offset, setOffset] = usePaging(listParams);
  const orders = useList('orders', { ...listParams, limit: PAGE_SIZE, offset });
  const remove = useRemove('orders');

  const current = analytics.data?.totals;
  const prev = prior ? previous.data?.totals : undefined;
  const points = analytics.data?.series ?? [];
  const granularity = analytics.data?.granularity ?? range.granularity;
  const productItems = products.data?.items ?? [];
  const experimentItems = experiments.data?.items ?? [];
  const selectedProduct = productItems.find((p) => p._id === scope.productId);
  const selectedExperiment = experimentItems.find((x) => x._id === scope.experimentId);
  const orderProduct = selectedProduct ?? productItems.find((p) => p._id === selectedExperiment?.productId);
  const filtered = [...Object.values(scope), ...Object.values(filters)].some(Boolean);
  const kpiError = analytics.error ?? summary.error;

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = () => {
    setScope(NO_SCOPE);
    setFilters(NO_FILTERS);
  };
  const goTo = (next) => {
    setOffset(next);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const confirmDelete = () =>
    remove.mutate(deleting._id, {
      onSuccess: () => {
        toast.success('Order deleted');
        setDeleting(null);
      },
      onError: (err) => toast.error(err),
    });

  const columns = [
    { key: 'date', header: 'Date', className: 'whitespace-nowrap', format: (v) => fmtDateTime(v) },
    { key: 'customer', header: 'Customer', render: (o) => <CustomerCell customer={o.customer} onOpen={setViewing} /> },
    {
      key: 'productName',
      header: 'Product',
      render: (o) => (
        <div className="max-w-48 min-w-0">
          <div className="truncate text-ink">{o.productName || DASH}</div>
          {o.experimentName && <div className="truncate text-xs text-muted">{o.experimentName}</div>}
        </div>
      ),
    },
    { key: 'items', header: 'Items', render: (o) => <ItemChips items={o.items} /> },
    { key: 'amount', header: 'Amount', align: 'right', render: (o) => <OrderAmount order={o} /> },
    { key: 'paymentStatus', header: 'Payment', render: (o) => <StatusBadge kind="paymentStatus" value={o.paymentStatus} /> },
    {
      key: 'refundStatus',
      header: 'Refund',
      render: (o) =>
        o.refundStatus === 'none' ? <span className="text-faint">{DASH}</span> : <StatusBadge kind="refundStatus" value={o.refundStatus} />,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (o) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Pencil} label="Edit order" size="icon-sm" onClick={() => setEditing({ order: o })} />
          <IconButton icon={Trash2} label="Delete order" size="icon-sm" onClick={() => setDeleting(o)} />
        </div>
      ),
    },
  ].map((c) => ({ ...c, sortable: false }));

  return (
    <>
      <PageHeader
        title="Orders"
        description={`${selectedProduct?.name ?? 'All products'} · ${fmtRange(range.range)}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
            Add order
          </Button>
        }
      />
      <FilterBar>
        <DateRangePicker />
        <GranularityControl />
        <Select
          aria-label="Product"
          className="w-full sm:w-52"
          value={scope.productId}
          onChange={(e) => setScope({ ...NO_SCOPE, productId: e.target.value })}
          placeholder="All products"
          options={productItems.map((p) => ({ value: p._id, label: p.name }))}
        />
        <Select
          aria-label="Experiment"
          className="w-full sm:w-52"
          value={scope.experimentId}
          onChange={(e) => setScope((s) => ({ ...s, experimentId: e.target.value }))}
          placeholder="All experiments"
          options={experimentItems.map((x) => ({ value: x._id, label: scope.productId ? x.name : `${x.name} · ${x.productName}` }))}
        />
        <Select
          aria-label="Campaign"
          className="w-full sm:w-48"
          value={scope.campaign}
          onChange={(e) => setScope((s) => ({ ...s, campaign: e.target.value }))}
          placeholder="All campaigns"
          options={[...new Set([...(experiments.data?.facets?.campaigns ?? []), ...(orders.data?.facets?.campaigns ?? [])])].sort()}
        />
      </FilterBar>

      {kpiError ? (
        <Card>
          <ErrorState
            error={kpiError}
            onRetry={() => {
              analytics.refetch();
              summary.refetch();
            }}
          />
        </Card>
      ) : (
        <OrderKpis
          current={current}
          previous={prev}
          summary={summary.data}
          points={points}
          loading={analytics.isPending}
          comparisonLabel={range.comparisonLabel}
        />
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <AddOnWaterfall orders={analytics} className="xl:col-span-2" />
        <TakeRates orders={analytics} previous={prev} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <KindColumns orders={analytics} className="xl:col-span-2" />
        <ChartCard
          title="Average order value"
          subtitle="Dashed line marks front-end AOV"
          value={current?.orders ? fmtCurrency(current.aov) : null}
          height={260}
          {...orderChartState(analytics)}
          table={{
            rowKey: 'key',
            columns: [periodColumn(granularity), { key: 'orders', header: 'Orders', align: 'right', format: (v) => fmtNumber(v) }, moneyColumn('aov', 'AOV')],
            rows: points,
          }}
          insight={
            current?.aov > current?.frontEndAov ? `Add-ons lift the average order by ${fmtCurrency(current.aov - current.frontEndAov)}.` : null
          }
        >
          <TrendChart
            data={points}
            granularity={granularity}
            format="currency"
            series={[{ key: 'aov', label: 'AOV', color: SERIES[0] }]}
            reference={
              current?.frontEndAov ? { value: current.frontEndAov, label: `Front-end ${fmtCurrency(current.frontEndAov)}` } : undefined
            }
          />
        </ChartCard>
      </div>

      <div ref={tableRef} className="scroll-mt-16">
        <Section title="All orders" description="Every order in the period, including pending and failed payments">
          <FilterBar>
            <SearchInput value={filters.q} onChange={(q) => setFilter('q', q)} placeholder="Search customer or item" />
            <Select
              aria-label="Payment status"
              className={half}
              value={filters.paymentStatus}
              onChange={(e) => setFilter('paymentStatus', e.target.value)}
              placeholder="Any payment"
              options={OPTIONS.paymentStatus}
            />
            <Select
              aria-label="Refund status"
              className={half}
              value={filters.refundStatus}
              onChange={(e) => setFilter('refundStatus', e.target.value)}
              placeholder="Any refund"
              options={OPTIONS.refundStatus}
            />
            <Select
              aria-label="Offer"
              className={half}
              value={filters.kind}
              onChange={(e) => setFilter('kind', e.target.value)}
              placeholder="Any offer"
              options={OPTIONS.kind}
            />
            <Select aria-label="Sort orders" className={half} value={sort} onChange={(e) => setSort(e.target.value)} options={SORTS} />
          </FilterBar>
          <Card className="min-w-0 overflow-hidden">
            <PagedList
              query={orders}
              offset={offset}
              onPage={goTo}
              empty={
                filtered ? (
                  <EmptyState
                    title="No orders match these filters."
                    description="Widen the date range or clear the filters."
                    action={
                      <Button size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon={ReceiptText}
                    title="No orders in this period."
                    description="Record a sale to start tracking AOV, upsells and refunds."
                    action={
                      <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing({})}>
                        Add order
                      </Button>
                    }
                  />
                )
              }
            >
              <DataTable columns={columns} rows={orders.data?.items ?? []} />
            </PagedList>
          </Card>
        </Section>
      </div>

      <OrderFormModal
        open={Boolean(editing)}
        order={editing?.order}
        defaults={{ product: orderProduct, experimentId: scope.experimentId, campaign: scope.campaign || selectedExperiment?.campaign }}
        onClose={() => setEditing(null)}
      />
      <CustomerModal open={Boolean(viewing)} id={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete this order?"
        message={deleting ? deleteMessage(deleting) : ''}
        loading={remove.isPending}
      />
    </>
  );
}
