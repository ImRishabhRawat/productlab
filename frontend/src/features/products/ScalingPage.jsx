import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { daysBetween } from '@product-lab/shared/dates';
import { deriveMetrics, pctChange, percent, sumTotals } from '@product-lab/shared/metrics';
import { productUpdateSchema } from '@product-lab/shared/schemas';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { KpiTile } from '../../components/charts/KpiTile.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { SERIES } from '../../components/charts/palette.js';
import { TrendChart } from '../../components/charts/TrendChart.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { currencySymbol, fmtCurrency, fmtDate, fmtMetric, fmtPercent, fmtRatio, plural } from '../../lib/format.js';
import { numberOrNull, useForm } from '../../lib/form.js';
import { seriesTable } from '../../lib/metricDisplay.js';
import { useAnalytics, useUpdate } from '../../lib/queries.js';
import { MetricEntryModal } from '../experiments/MetricEntryModal.jsx';
import { productBreakEven } from './productMetrics.js';
import { ProductTabs } from './ProductTabs.jsx';

const CAPTION = 'mb-2 text-xs font-medium tracking-wide text-muted uppercase';

const values = (points, key) => points.map((p) => p[key]);

function running(points, key) {
  let total = 0;
  return points.map((p) => (total += p[key]));
}

function BudgetMeter({ label, spent, budget, marker, suffix, left = 'left' }) {
  if (!(budget > 0)) {
    return (
      <div>
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className="text-body">{label}</span>
          <span className="text-muted">Not set</span>
        </div>
        <p className="mt-2 text-xs text-muted">
          {fmtCurrency(spent)} spent{suffix}
        </p>
      </div>
    );
  }
  const pct = percent(spent, budget);
  const over = pct > 100;
  const tone = over ? 'critical' : pct >= 90 ? 'warning' : 'default';
  return (
    <div>
      <Meter
        label={label}
        valueLabel={`${fmtCurrency(spent)} / ${fmtCurrency(budget)}`}
        value={spent}
        max={budget}
        tone={tone}
        marker={marker}
        height={10}
      />
      <p className="mt-2 text-xs text-muted">
        {tone !== 'default' && (
          <span className={`font-medium ${over ? 'text-negative' : 'text-warning'}`}>{over ? 'Over budget' : 'Near limit'} · </span>
        )}
        {fmtPercent(pct)} used · {fmtCurrency(Math.round(Math.abs(budget - spent)))} {over ? 'over' : left}
        {suffix}
      </p>
    </div>
  );
}

function BudgetForm({ product, days, onDone }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const update = useUpdate('products');
  const form = useForm(() => ({ budget: { daily: String(product.budget?.daily ?? ''), monthly: String(product.budget?.monthly ?? '') } }));
  const daily = numberOrNull(form.values.budget.daily);
  const amount = { type: 'number', min: '0', step: '1', inputMode: 'decimal', prefix: currencySymbol(), placeholder: 'No cap' };

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(productUpdateSchema, {
      budget: { daily: numberOrNull(form.values.budget.daily), monthly: numberOrNull(form.values.budget.monthly) },
    });
    if (!body) return;
    try {
      const saved = await update.mutateAsync({ id: product._id, ...body });
      const patch = (i) => (i.product._id === saved._id ? { ...i, product: { ...i.product, budget: saved.budget } } : i);
      queryClient.setQueriesData({ queryKey: ['analytics', 'scaling'] }, (data) => data && { ...data, items: data.items.map(patch) });
      toast.success('Budget saved');
      onDone();
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <FormField form={form} name="budget.daily" label="Daily budget" {...amount} />
      <FormField
        form={form}
        name="budget.monthly"
        label="Monthly budget"
        {...amount}
        hint={daily > 0 ? `${fmtCurrency(daily * days)} at the daily cap for ${days} days` : undefined}
      />
      <div className="flex items-start justify-end gap-2 sm:col-span-2 lg:col-span-1 lg:pt-6">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" loading={update.isPending}>
          Save budget
        </Button>
      </div>
    </form>
  );
}

function BudgetCard({ item, latest, isToday }) {
  const [editing, setEditing] = useState(false);
  const { product, today, mtd, perDay, month } = item;
  const { daily, monthly } = product.budget ?? {};
  const unset = !(daily > 0) || !(monthly > 0);
  const projected = mtd.spend + Math.max(perDay.spend - today.spend, 0) + perDay.spend * (month.days - month.day);
  const gap = fmtCurrency(Math.round(Math.abs(monthly - projected)));
  const pacing = !(monthly > 0)
    ? 'Set daily and monthly caps to track pacing'
    : projected > monthly
      ? `On pace to overshoot the monthly budget by ${gap}`
      : `On pace to finish the month ${gap} under budget`;

  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Budget"
        subtitle={pacing}
        className="mb-4"
        actions={
          !editing && (
            <Button size="sm" variant={unset ? 'primary' : 'secondary'} icon={Pencil} onClick={() => setEditing(true)}>
              {unset ? 'Set budget' : 'Edit'}
            </Button>
          )
        }
      />
      {editing ? (
        <BudgetForm product={product} days={month.days} onDone={() => setEditing(false)} />
      ) : (
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
          <BudgetMeter
            label="Daily budget"
            spent={latest.spend}
            budget={daily}
            left={isToday ? 'left' : 'under'}
            suffix={isToday ? ' today' : ` on ${fmtDate(latest.key)}`}
            marker={{ value: perDay.spend, label: `7-day avg ${fmtCurrency(perDay.spend)}` }}
          />
          <BudgetMeter
            label="Monthly spend"
            spent={mtd.spend}
            budget={monthly}
            suffix={` · day ${month.day} of ${month.days}`}
            marker={{ value: projected, label: `Month-end ≈ ${fmtCurrency(projected, { compact: true })}` }}
          />
        </div>
      )}
    </Card>
  );
}

function ScalingProduct({ item, fetching, onRecord }) {
  const { today: todayKey } = useDateRange();
  const { product, since, last7, sinceScaling, perDay, series } = item;
  const latest = series.findLast((p) => p.spend > 0) ?? series.at(-1) ?? { key: todayKey, spend: 0 };
  const isToday = latest.key === todayKey;
  const scaled = series.filter((p) => p.key >= since);
  const prior = deriveMetrics(sumTotals(series.slice(-14, -7)));
  const last30 = deriveMetrics(sumTotals(series));
  const { breakEvenCac } = productBreakEven(product, last30);
  const reference = breakEvenCac > 0 && { value: breakEvenCac, label: `Break-even ${fmtCurrency(Math.round(breakEvenCac))}` };
  const days = daysBetween(since, todayKey) + 1;
  const daily = product.budget?.daily;
  const meta = [
    `Scaling since ${fmtDate(since, { year: true })}`,
    plural(days, 'day'),
    product.category,
    fmtCurrency(product.price),
    product.version,
  ];
  const chart = { height: 200, fetching, empty: !last30.spend && !last30.revenue, emptyMessage: 'No metrics in the last 30 days.' };
  const pace = (key) => ({ delta: pctChange(last7[key], prior[key]), comparisonLabel: 'vs prior 7 days', spark: values(series, key) });

  return (
    <section className="border-t border-hairline pt-8 first:border-t-0 first:pt-0">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold tracking-[-0.01em] text-ink">
            <Link to={`/products/${product._id}`} className="hover:underline">
              {product.name}
            </Link>
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">{meta.filter(Boolean).join(' · ')}</p>
        </div>
        <Button size="sm" icon={Plus} onClick={() => onRecord(product._id)}>
          Record metrics
        </Button>
      </div>

      <p className={CAPTION}>Since scaling</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile metric="spend" value={sinceScaling.spend} spark={running(scaled, 'spend')} />
        <KpiTile metric="revenue" value={sinceScaling.revenue} spark={running(scaled, 'revenue')} />
        <KpiTile metric="cac" value={sinceScaling.cac} spark={values(scaled, 'cac')} />
        <KpiTile metric="roas" value={sinceScaling.roas} spark={values(scaled, 'roas')} />
      </div>
      <p className={`mt-4 ${CAPTION}`}>Current pace · 7-day average vs prior 7 days</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          metric="spend"
          label={isToday ? "Today's spend" : `Spend on ${fmtDate(latest.key)}`}
          value={latest.spend}
          spark={values(series, 'spend')}
        />
        <KpiTile metric="purchases" label="Purchases / day" value={perDay.purchases} {...pace('purchases')} />
        <KpiTile metric="revenue" label="Revenue / day" value={perDay.revenue} {...pace('revenue')} />
        <KpiTile metric="contribution" label="Profit / day" value={perDay.contribution} {...pace('contribution')} />
      </div>

      <div className="mt-4">
        <BudgetCard item={item} latest={latest} isToday={isToday} />
      </div>

      <Section title="Last 30 days" description={`Daily figures · scaling began ${fmtDate(since)}`}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ChartCard
            title="Ad spend"
            value={fmtCurrency(last30.spend)}
            {...chart}
            table={seriesTable(series, 'day', ['spend'])}
            insight={`7-day average ${fmtCurrency(perDay.spend)} a day${daily > 0 ? ` against a ${fmtCurrency(daily)} daily budget` : ''}.`}
          >
            <ColumnChart data={series} format="currency" series={[{ key: 'spend', label: 'Ad spend', color: SERIES[1] }]} />
          </ChartCard>
          <ChartCard
            title="Revenue"
            value={fmtCurrency(last30.revenue)}
            {...chart}
            table={seriesTable(series, 'day', ['revenue', 'roas'])}
            insight={`7-day ROAS ${fmtRatio(last7.roas)} vs ${fmtRatio(sinceScaling.roas)} since scaling.`}
          >
            <TrendChart data={series} format="currency" area series={[{ key: 'revenue', label: 'Revenue', color: SERIES[0] }]} />
          </ChartCard>
          <ChartCard
            title="Purchases"
            value={fmtMetric('purchases', last30.purchases)}
            {...chart}
            table={seriesTable(series, 'day', ['purchases'])}
          >
            <ColumnChart data={series} series={[{ key: 'purchases', label: 'Purchases', color: SERIES[0] }]} />
          </ChartCard>
          <ChartCard
            title="Customer acquisition cost"
            value={fmtMetric('cac', last30.cac)}
            {...chart}
            table={seriesTable(series, 'day', ['cac', 'spend', 'purchases'])}
            insight={`7-day CAC ${fmtMetric('cac', last7.cac)} vs ${fmtMetric('cac', sinceScaling.cac)} since scaling.`}
          >
            <TrendChart data={series} format="currency" reference={reference} series={[{ key: 'cac', label: 'CAC', color: SERIES[1] }]} />
          </ChartCard>
        </div>
      </Section>
    </section>
  );
}

function ScalingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-11 w-72" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-40" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}

export default function ScalingPage() {
  const { today } = useDateRange();
  const [recording, setRecording] = useState(null);
  const scaling = useAnalytics('scaling');
  const items = scaling.data?.items ?? [];

  return (
    <>
      <PageHeader title="Scaling" description={`Spend, budget pace and returns as of ${fmtDate(today, { year: true })}`} />
      <ProductTabs />
      {scaling.isPending ? (
        <ScalingSkeleton />
      ) : scaling.error ? (
        <Card>
          <ErrorState error={scaling.error} onRetry={scaling.refetch} />
        </Card>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={Rocket}
            title="No products are scaling."
            description="Products you move to Scaling show their budgets, pace and trends here."
            action={<ButtonLink to="/products">View products</ButtonLink>}
          />
        </Card>
      ) : (
        <div className="space-y-12">
          {items.map((item) => (
            <ScalingProduct key={item.product._id} item={item} fetching={scaling.isFetching} onRecord={setRecording} />
          ))}
        </div>
      )}
      <MetricEntryModal open={Boolean(recording)} onClose={() => setRecording(null)} defaults={{ productId: recording }} />
    </>
  );
}
