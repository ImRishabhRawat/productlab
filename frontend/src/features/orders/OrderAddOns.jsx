import { useState } from 'react';
import { LABELS, ORDER_ITEM_KINDS } from '@product-lab/shared/constants';
import { percent, ratio } from '@product-lab/shared/metrics';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { ORDER_KIND_COLORS } from '../../components/charts/palette.js';
import { Waterfall } from '../../components/charts/Waterfall.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { fmtCurrency, fmtNumber, fmtPercent } from '../../lib/format.js';
import { moneyColumn, periodColumn } from '../../lib/metricDisplay.js';

const ADD_ONS = ['bump', 'upsell', 'bundle'];
const TAKE_RATE = { bump: 'bumpRate', upsell: 'upsellRate', bundle: 'bundleRate' };
const VIEWS = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'order', label: 'Per order' },
];
const KIND_SERIES = ORDER_ITEM_KINDS.map((k) => ({ key: k, label: LABELS.orderItemKind[k], color: ORDER_KIND_COLORS[k] }));
const rateColumn = (key, header) => ({ key, header, align: 'right', format: (v) => fmtPercent(v) });

export const orderChartState = (orders) => ({
  loading: orders.isPending,
  fetching: orders.isFetching,
  error: orders.error,
  onRetry: orders.refetch,
  empty: orders.isSuccess && !orders.data.totals.orders,
  emptyMessage: 'No paid orders in this period.',
});

const kindRows = (t) =>
  t
    ? [
        ...ORDER_ITEM_KINDS.map((k) => ({
          key: k,
          label: LABELS.orderItemKind[k],
          orders: t.kinds[k].orders,
          rate: percent(t.kinds[k].orders, t.orders),
          revenue: t.kinds[k].revenue,
          perOrder: ratio(t.kinds[k].revenue, t.orders),
        })),
        { key: 'total', label: 'Total', orders: t.orders, rate: null, revenue: t.revenue, perOrder: t.aov },
      ]
    : [];

export function AddOnWaterfall({ orders, className }) {
  const [view, setView] = useState('revenue');
  const t = orders.data?.totals;
  const perOrder = view === 'order';
  const addOns = ADD_ONS.reduce((sum, k) => sum + (t?.kinds[k].revenue ?? 0), 0);
  const steps = [
    ...ORDER_ITEM_KINDS.map((k) => {
      const revenue = t?.kinds[k].revenue ?? 0;
      return { label: LABELS.orderItemKind[k], value: perOrder ? (ratio(revenue, t?.orders) ?? 0) : revenue, type: 'add', color: ORDER_KIND_COLORS[k] };
    }),
    { label: perOrder ? 'AOV' : 'Total', value: 0, type: 'total' },
  ];
  return (
    <ChartCard
      className={className}
      title="How add-ons build revenue"
      subtitle="Main product, then order bumps, upsells and bundles"
      height={280}
      toolbar={<SegmentedControl size="sm" label="Show" options={VIEWS} value={view} onChange={setView} />}
      {...orderChartState(orders)}
      table={{
        rowKey: 'key',
        rows: kindRows(t),
        columns: [
          { key: 'label', header: 'Offer' },
          { key: 'orders', header: 'Orders', align: 'right', format: (v) => fmtNumber(v) },
          rateColumn('rate', 'Take rate'),
          moneyColumn('revenue', 'Revenue'),
          moneyColumn('perOrder', 'Per order'),
        ],
      }}
      insight={addOns > 0 ? `Add-ons bring ${fmtPercent(percent(addOns, t.revenue))} of revenue, ${fmtCurrency(ratio(addOns, t.orders))} per order.` : null}
    >
      <div className="h-full overflow-x-auto">
        <div className="h-full min-w-[28rem]">
          <Waterfall steps={steps} />
        </div>
      </div>
    </ChartCard>
  );
}

export function TakeRates({ orders, previous, refundAssumption }) {
  const t = orders.data?.totals;
  const refunds = t?.refundRate ?? 0;
  const within = refunds <= refundAssumption;
  return (
    <ChartCard
      title="Add-on take rates"
      subtitle="Share of paid orders that took each add-on"
      height={null}
      {...orderChartState(orders)}
      table={{
        rowKey: 'label',
        rows: [
          ...ADD_ONS.map((k) => ({ label: LABELS.orderItemKind[k], rate: t?.[TAKE_RATE[k]], previous: previous?.[TAKE_RATE[k]] })),
          ...(refundAssumption != null ? [{ label: 'Refunds, actual', rate: refunds }, { label: 'Refunds, assumed', rate: refundAssumption }] : []),
        ],
        columns: [{ key: 'label', header: 'Measure' }, rateColumn('rate', 'Rate'), ...(previous ? [rateColumn('previous', 'Previous period')] : [])],
      }}
    >
      <div className="space-y-5">
        {ADD_ONS.map((k) => {
          const rate = t?.[TAKE_RATE[k]];
          const before = previous?.[TAKE_RATE[k]];
          return (
            <div key={k}>
              <Meter
                label={LABELS.orderItemKind[k]}
                valueLabel={fmtPercent(rate)}
                value={rate}
                max={100}
                marker={before != null ? { value: before, label: `Prev. ${fmtPercent(before)}` } : undefined}
              />
              <p className="mt-1 text-xs text-muted">
                {fmtNumber(t?.kinds[k].orders)} orders · {fmtCurrency(t?.kinds[k].revenue)}
              </p>
            </div>
          );
        })}
        {refundAssumption != null && (
          <div className="border-t border-hairline-soft pt-4">
            <Meter
              label={`Refunds · ${within ? 'within' : 'above'} assumption`}
              value={refunds}
              max={Math.max(refunds, refundAssumption, 1) * 1.5}
              tone={within ? 'good' : 'critical'}
              marker={{ value: refundAssumption, label: `Assumed ${fmtPercent(refundAssumption)}` }}
              valueLabel={fmtPercent(refunds)}
            />
            <p className="mt-2 text-xs text-muted">
              {within ? 'Contribution uses the assumed rate, so it errs on the safe side.' : 'Contribution uses the assumed rate, so it is overstated.'}
            </p>
          </div>
        )}
      </div>
    </ChartCard>
  );
}

export function KindColumns({ orders, className }) {
  const points = orders.data?.series ?? [];
  const granularity = orders.data?.granularity;
  return (
    <ChartCard
      className={className}
      title="Revenue by offer type"
      subtitle="Paid revenue from the main product and each add-on"
      height={260}
      {...orderChartState(orders)}
      table={{
        rowKey: 'key',
        rows: points,
        columns: [periodColumn(granularity), ...KIND_SERIES.map((s) => moneyColumn(s.key, s.label)), moneyColumn('revenue', 'Total')],
      }}
    >
      <ColumnChart data={points} granularity={granularity} format="currency" stacked series={KIND_SERIES} />
    </ChartCard>
  );
}
