import { RotateCcw, ShoppingCart } from 'lucide-react';
import { breakEven } from '@product-lab/shared/metrics';
import { productUpdateSchema } from '@product-lab/shared/schemas';
import { Meter } from '../../components/charts/Meter.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader, Stat } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { EmptyState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { currencySymbol, fmtCurrency, fmtNumber, fmtPercent, fmtRatio } from '../../lib/format.js';
import { numberOrNull, numberOrUndefined, str, useForm } from '../../lib/form.js';
import { useAnalytics, useUpdate } from '../../lib/queries.js';
import { FinancialBreakdown } from '../analytics/FinancialBreakdown.jsx';
import { AddOnWaterfall, KindColumns, TakeRates } from '../orders/OrderAddOns.jsx';
import { standing } from './productMetrics.js';

function calculatorValues(product, t) {
  return {
    price: str(product.price),
    aov: str(t?.aov),
    adSpend: str(t?.spend),
    desiredMarginPct: str(product.desiredMarginPct),
    costs: {
      paymentFeePct: str(product.costs?.paymentFeePct),
      refundRatePct: str(product.costs?.refundRatePct),
      variableCostPerSale: str(product.costs?.variableCostPerSale),
    },
  };
}

function Calculator({ product, totals: t }) {
  const toast = useToast();
  const initial = calculatorValues(product, t);
  const form = useForm(() => calculatorValues(product, t));
  const save = useUpdate('products');
  const v = form.values;
  const input = {
    price: numberOrUndefined(v.price),
    aov: numberOrUndefined(v.aov),
    adSpend: numberOrUndefined(v.adSpend),
    desiredMarginPct: Number(v.desiredMarginPct),
    paymentFeePct: Number(v.costs.paymentFeePct),
    refundRatePct: Number(v.costs.refundRatePct),
    variableCostPerSale: Number(v.costs.variableCostPerSale),
  };
  const r = breakEven(input);
  const changed = JSON.stringify(v) !== JSON.stringify(initial);
  const dirty = v.price !== initial.price || v.desiredMarginPct !== initial.desiredMarginPct || JSON.stringify(v.costs) !== JSON.stringify(initial.costs);
  const cac = t?.cac;
  const roas = t?.roas;
  const [cacTone, cacState] = standing(cac, { target: r.targetCac, limit: r.breakEvenCac }, true) ?? [];
  const [roasTone, roasState] = standing(roas, { target: r.targetRoas, limit: r.breakEvenRoas }, false) ?? [];
  const money = { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', prefix: currencySymbol() };
  const pct = { type: 'number', min: '0', max: '100', step: '0.1', inputMode: 'decimal', suffix: '%', placeholder: '0' };

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(productUpdateSchema, {
      price: numberOrNull(v.price),
      desiredMarginPct: input.desiredMarginPct,
      costs: { paymentFeePct: input.paymentFeePct, refundRatePct: input.refundRatePct, variableCostPerSale: input.variableCostPerSale },
    });
    if (!body) return;
    try {
      await save.mutateAsync({ id: product._id, ...body });
      toast.success('Assumptions saved');
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader title="Break-even calculator" subtitle="Edit any input to test a scenario. Outputs update as you type." />
      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <form onSubmit={submit} noValidate className="min-w-0">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            <FormField form={form} name="price" label="Selling price" {...money} />
            <FormField form={form} name="aov" label="Revenue per sale" hint="AOV incl. add-ons" placeholder="Same as price" {...money} />
            <FormField form={form} name="adSpend" label="Ad spend" hint="This period" {...money} />
            <FormField form={form} name="costs.paymentFeePct" label="Payment fee" {...pct} />
            <FormField form={form} name="costs.refundRatePct" label="Expected refunds" {...pct} />
            <FormField form={form} name="costs.variableCostPerSale" label="Other cost / sale" placeholder="0" {...money} />
            <FormField form={form} name="desiredMarginPct" label="Desired margin" {...pct} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" variant="primary" loading={save.isPending} disabled={!dirty}>
              Save assumptions
            </Button>
            <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!changed} onClick={() => form.setValues(initial)}>
              Reset
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">Saves price, costs and margin to the product. Revenue per sale and ad spend are scenario only.</p>
        </form>

        <div className="min-w-0">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <Stat label="Break-even CAC" value={fmtCurrency(r.breakEvenCac)} sub="Most you can pay per sale" />
            <Stat label="Target CAC" value={fmtCurrency(r.targetCac)} sub={`Keeps a ${fmtPercent(input.desiredMarginPct)} margin`} />
            <Stat label="Break-even ROAS" value={fmtRatio(r.breakEvenRoas)} sub={`Target ${fmtRatio(r.targetRoas)}`} />
            <Stat
              label="Break-even purchases"
              value={fmtNumber(r.breakEvenPurchases)}
              sub={`For ${fmtCurrency(input.adSpend ?? 0)} spend · target ${fmtNumber(r.targetPurchases)}`}
            />
          </div>
          <div className="mt-5 space-y-5 border-t border-hairline-soft pt-5">
            {!(r.breakEvenCac > 0) ? (
              <p className="text-[13px] text-muted">Costs exceed revenue per sale, so no CAC can break even.</p>
            ) : cac == null ? (
              <p className="text-[13px] text-muted">No purchases in this period to compare against.</p>
            ) : (
              <>
                <Meter
                  value={cac}
                  max={Math.max(cac, r.breakEvenCac) * 1.25}
                  tone={cacTone}
                  marker={{ value: r.breakEvenCac, label: 'Break-even' }}
                  label={`Current CAC · ${cacState}`}
                  valueLabel={`${fmtCurrency(cac)} / ${fmtCurrency(r.breakEvenCac)}`}
                />
                {roas != null && r.breakEvenRoas && (
                  <Meter
                    value={roas}
                    max={Math.max(roas, r.breakEvenRoas) * 1.25}
                    tone={roasTone}
                    marker={{ value: r.breakEvenRoas, label: 'Break-even' }}
                    label={`Current ROAS · ${roasState}`}
                    valueLabel={`${fmtRatio(roas)} / ${fmtRatio(r.breakEvenRoas)}`}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ProductEconomics({ product, summary }) {
  const range = useDateRange();
  const orders = useAnalytics('orders', { ...range.params, productId: product._id });
  const t = summary.data?.current;
  return (
    <div className="space-y-4">
      <FinancialBreakdown summary={summary} target={product.desiredMarginPct} />
      {summary.isPending ? <Skeleton className="h-80" /> : <Calculator key={`${product.updatedAt}|${t?.aov}|${t?.spend}`} product={product} totals={t} />}
      {orders.isSuccess && !orders.data.totals?.orders ? (
        <Card className="p-4 sm:p-5">
          <CardHeader title="AOV and add-ons" subtitle="How order bumps, upsells and bundles lift revenue per order" />
          <EmptyState
            compact
            icon={ShoppingCart}
            title="No paid orders in this period."
            description="Record orders to see add-on take rates and the real refund rate."
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <AddOnWaterfall orders={orders} className="lg:col-span-2" />
            <TakeRates orders={orders} refundAssumption={product.costs?.refundRatePct ?? 0} />
          </div>
          <KindColumns orders={orders} />
        </>
      )}
    </div>
  );
}
