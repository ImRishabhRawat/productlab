import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, History, Pencil } from 'lucide-react';
import { Link } from 'react-router';
import { productUpdateSchema } from '@product-lab/shared/schemas';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { DIVERGING, METRIC_COLORS } from '../../components/charts/palette.js';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, Stat } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtCurrency, fmtDate, fmtMetric, fmtNumber, fmtRatio, plural } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { moneyColumn } from '../../lib/metricDisplay.js';
import { useAnalytics, useUpdate } from '../../lib/queries.js';
import { ProductTabs } from './ProductTabs.jsx';

const LABEL = 'text-xs font-medium tracking-wide text-muted uppercase';
const PRODUCT = { key: 'name', header: 'Product' };
const SPEND_COLUMNS = [
  PRODUCT,
  moneyColumn('spend', 'Ad spend'),
  moneyColumn('revenue', 'Revenue'),
  { key: 'purchases', header: 'Purchases', align: 'right' },
];
const CONTRIBUTION_COLUMNS = [
  PRODUCT,
  moneyColumn('revenue', 'Revenue'),
  moneyColumn('variableCosts', 'Fees & refunds'),
  moneyColumn('spend', 'Ad spend'),
  moneyColumn('contribution', 'Net'),
];

function Money({ value }) {
  return <span className={value < 0 ? 'text-negative' : undefined}>{fmtCurrency(value)}</span>;
}

function Summary({ totals, items, ideas }) {
  const experiments = items.reduce((n, i) => n + i.experiments, 0);
  return (
    <Card className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 sm:p-5 md:grid-cols-3 xl:grid-cols-5">
      <Stat
        label="Products killed"
        value={fmtNumber(totals.products)}
        sub={ideas.length ? `plus ${plural(ideas.length, 'killed idea')}` : undefined}
      />
      <Stat label="Ad spend lost" value={fmtCurrency(totals.spend)} sub={`across ${plural(experiments, 'experiment')}`} />
      <Stat label="Revenue generated" value={fmtCurrency(totals.revenue)} sub={`ROAS ${fmtRatio(totals.roas)}`} />
      <Stat label="Purchases" value={fmtNumber(totals.purchases)} sub={`CAC ${fmtMetric('cac', totals.cac)}`} />
      <Stat
        label="Net contribution"
        value={<Money value={totals.contribution} />}
        sub="After fees, refunds and ad spend"
        className="col-span-2 md:col-span-1"
      />
    </Card>
  );
}

function Charts({ items, totals }) {
  const bars = (key, sort) => [...items].sort(sort).map((i) => ({ key: i._id, label: i.name, value: i[key], href: `/products/${i._id}` }));
  const avgDays = Math.round(items.reduce((n, i) => n + i.lifespanDays, 0) / items.length);
  const avgSpend = fmtCurrency(Math.round(totals.spend / items.length));
  const returned = fmtCurrency(Math.round(totals.roas * 100));

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard
        title="Ad spend by product"
        subtitle="Spent on ads before the kill"
        height={null}
        table={{ columns: SPEND_COLUMNS, rows: items }}
        insight={`Average run before a kill: ${plural(avgDays, 'day')} and ${avgSpend} in ad spend.`}
      >
        <BarList labelWidth="13rem" color={METRIC_COLORS.spend} items={bars('spend', (a, b) => b.spend - a.spend)} />
      </ChartCard>
      <ChartCard
        title="Net contribution by product"
        subtitle="Revenue left after fees, refunds and ad spend"
        height={null}
        table={{ columns: CONTRIBUTION_COLUMNS, rows: items }}
        insight={totals.spend > 0 ? `Every ${fmtCurrency(100)} of ad spend brought back ${returned} in revenue.` : null}
      >
        <BarList labelWidth="13rem" color={DIVERGING.positive} items={bars('contribution', (a, b) => a.contribution - b.contribution)} />
      </ChartCard>
    </div>
  );
}

function NotesForm({ item, onDone }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const update = useUpdate('products');
  const form = useForm(() => ({ killReason: item.killReason ?? '', learnings: item.learnings ?? '' }));

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(productUpdateSchema, { killReason: form.values.killReason, learnings: form.values.learnings });
    if (!body) return;
    try {
      const saved = await update.mutateAsync({ id: item._id, ...body });
      const patch = (i) => (i._id === saved._id ? { ...i, killReason: saved.killReason, learnings: saved.learnings } : i);
      queryClient.setQueriesData({ queryKey: ['analytics', 'graveyard'] }, (data) => data && { ...data, items: data.items.map(patch) });
      toast.success('Notes saved');
      onDone();
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-lg bg-tint/50 p-4">
      <FormField form={form} name="killReason" label="Why killed" as="textarea" rows={2} placeholder="What made you stop?" />
      <FormField
        form={form}
        name="learnings"
        label="What we learned"
        as="textarea"
        rows={4}
        placeholder="What would you do differently next time?"
      />
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button size="sm" type="submit" variant="primary" loading={update.isPending}>
          Save notes
        </Button>
      </div>
    </form>
  );
}

function Note({ title, text, empty, action, className = '' }) {
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <h4 className={LABEL}>{title}</h4>
        {action}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-body">
        {text || <span className="text-faint">{empty}</span>}
      </p>
    </div>
  );
}

function GraveyardCard({ item }) {
  const [editing, setEditing] = useState(false);
  const meta = [
    `Killed ${fmtDate(item.killedAt, { year: true })} after ${plural(item.lifespanDays, 'day')}`,
    plural(item.experiments, 'experiment'),
    item.category,
    fmtCurrency(item.price),
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-medium text-ink">
            <Link to={`/products/${item._id}`} className="hover:underline">
              {item.name}
            </Link>
          </h3>
          <p className="mt-0.5 text-[13px] text-muted">{meta.filter(Boolean).join(' · ')}</p>
        </div>
        <ButtonLink to={`/products/${item._id}`} size="sm" variant="ghost" icon={History}>
          Full history
        </ButtonLink>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid grid-cols-2 gap-4 self-start sm:grid-cols-3">
          <Stat label="Ad spend" value={fmtCurrency(item.spend)} />
          <Stat label="Revenue" value={fmtCurrency(item.revenue)} />
          <Stat label="Net contribution" value={<Money value={item.contribution} />} />
          <Stat label="Purchases" value={fmtNumber(item.purchases)} />
          <Stat label="CAC" value={fmtMetric('cac', item.cac)} />
          <Stat label="ROAS" value={fmtMetric('roas', item.roas)} />
        </div>
        {editing ? (
          <NotesForm item={item} onDone={() => setEditing(false)} />
        ) : (
          <div className="rounded-lg bg-tint/50 p-4">
            <Note
              title="Why killed"
              text={item.killReason}
              empty="No reason recorded yet."
              action={
                <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)} className="-my-2 -mr-2">
                  Edit notes
                </Button>
              }
            />
            <Note title="What we learned" text={item.learnings} empty="No learnings recorded yet." className="mt-4" />
          </div>
        )}
      </div>
    </Card>
  );
}

function KilledIdeas({ ideas }) {
  return (
    <Section title="Killed ideas" description="Dropped before they became products">
      <Card as="ul" className="divide-y divide-hairline-soft">
        {ideas.map((idea) => (
          <li key={idea._id} className="flex items-start justify-between gap-4 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="truncate text-[13px]">
                <Link to={`/ideas/${idea._id}`} className="font-medium text-ink hover:underline">
                  {idea.name}
                </Link>
                {idea.category && <span className="text-muted"> · {idea.category}</span>}
              </p>
              {idea.notes && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{idea.notes}</p>}
            </div>
            <time dateTime={idea.updatedAt} className="shrink-0 text-xs text-faint">
              {fmtDate(idea.updatedAt, { year: true })}
            </time>
          </li>
        ))}
      </Card>
    </Section>
  );
}

function GraveyardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-24" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="h-52" />
      <Skeleton className="h-52" />
    </div>
  );
}

export default function GraveyardPage() {
  const graveyard = useAnalytics('graveyard');
  const { items = [], totals, ideas = [] } = graveyard.data ?? {};

  return (
    <>
      <PageHeader title="Graveyard" description="What killed products cost, earned and taught. Their history stays intact." />
      <ProductTabs />
      {graveyard.isPending ? (
        <GraveyardSkeleton />
      ) : graveyard.error ? (
        <Card>
          <ErrorState error={graveyard.error} onRetry={graveyard.refetch} />
        </Card>
      ) : (
        <>
          {items.length ? (
            <>
              <Summary totals={totals} items={items} ideas={ideas} />
              <Charts items={items} totals={totals} />
              <Section title="Killed products" description="Why each was stopped and what it taught">
                <div className="space-y-4">
                  {items.map((item) => (
                    <GraveyardCard key={item._id} item={item} />
                  ))}
                </div>
              </Section>
            </>
          ) : (
            <Card>
              <EmptyState
                icon={Archive}
                title="Nothing in the graveyard yet."
                description="Killed products land here with their spend, results and lessons."
                action={<ButtonLink to="/products">View products</ButtonLink>}
              />
            </Card>
          )}
          {ideas.length > 0 && <KilledIdeas ideas={ideas} />}
        </>
      )}
    </>
  );
}
