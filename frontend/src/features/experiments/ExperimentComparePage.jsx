import { GitCompareArrows, X } from 'lucide-react';
import { Link } from 'react-router';
import { EXPERIMENT_VARIABLES, FUNNEL_STAGES, LABELS, METRICS, SMALL_SAMPLE_PURCHASES } from '@product-lab/shared/constants';
import { changedVariables } from '@product-lab/shared/metrics';
import { objectId } from '@product-lab/shared/schemas';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ColumnChart } from '../../components/charts/ColumnChart.jsx';
import { Funnel } from '../../components/charts/Funnel.jsx';
import { METRIC_COLORS } from '../../components/charts/palette.js';
import { ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtCurrency, fmtMetric, fmtNumber, plural, truncate } from '../../lib/format.js';
import { lowerIsBetter, measured, ranked } from '../../lib/metricDisplay.js';
import { useAnalytics, useList } from '../../lib/queries.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import {
  MAX_COMPARE,
  byStart,
  durationDays,
  experimentSpan,
  fmtVariable,
  isSmallSample,
  ScopeControl,
  SmallSampleNote,
  useScope,
} from './ExperimentParts.jsx';

const SUBTITLES = {
  cac: 'Ad spend per purchase · lower is better',
  roas: 'Revenue per unit of ad spend · higher is better',
  purchases: `Under ${SMALL_SAMPLE_PURCHASES} is a small sample`,
  aov: 'Revenue per purchase · higher is better',
  conversionRate: 'Purchases per landing page view · higher is better',
  ctr: 'Clicks per impression · higher is better',
};
const RESULTS = ['spend', 'purchases', 'revenue', 'cac', 'roas', 'conversionRate'];

const parseIds = (value) => [...new Set(value.split(',').filter((id) => objectId.safeParse(id).success))];

function leader(items, key) {
  const list = ranked(items, key);
  if (list.length < 2) return null;
  return `${lowerIsBetter(key) ? 'Lowest' : 'Highest'}: ${list[0].name} at ${fmtMetric(key, list[0][key])}.`;
}

function MetricBars({ metric, items, state }) {
  return (
    <ChartCard
      title={METRICS[metric].label}
      subtitle={SUBTITLES[metric]}
      height={null}
      {...state}
      insight={leader(items, metric)}
      table={{
        rowKey: '_id',
        rows: items,
        columns: [
          { key: 'name', header: 'Experiment' },
          { key: metric, header: METRICS[metric].label, align: 'right', format: measured(metric) },
        ],
      }}
    >
      <BarList
        format={METRICS[metric].format}
        labelWidth="min(12rem, 34vw)"
        items={items.map((x) => ({
          key: x._id,
          label: x.name,
          value: x.hasData ? x[metric] : null,
          href: `/experiments/${x._id}`,
        }))}
      />
    </ChartCard>
  );
}

function Selection({ ids, known, catalog, onChange }) {
  const nameOf = (id) => known.get(id)?.name ?? (catalog.isPending ? 'Loading…' : 'Unknown experiment');
  const options = (catalog.data?.items ?? [])
    .filter((x) => !ids.includes(x._id))
    .sort((a, b) => a.productName.localeCompare(b.productName) || byStart(a, b))
    .map((x) => ({ value: x._id, label: `${x.productName} · ${x.name}` }));
  const full = ids.length >= MAX_COMPARE;
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {ids.map((id, i) => (
        <span
          key={id}
          className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-hairline bg-canvas py-0.5 pr-0.5 pl-3 text-[13px]"
        >
          <Link to={`/experiments/${id}`} className="truncate font-medium text-ink hover:underline">
            {nameOf(id)}
          </Link>
          {i === 0 && <span className="shrink-0 text-xs text-muted">Baseline</span>}
          <IconButton icon={X} size="icon-sm" label={`Remove ${nameOf(id)}`} onClick={() => onChange(ids.filter((v) => v !== id))} />
        </span>
      ))}
      <Select
        aria-label="Add an experiment"
        className="w-full sm:w-72"
        value=""
        disabled={full || catalog.isPending}
        onChange={(e) => e.target.value && onChange([...ids, e.target.value])}
        placeholder={full ? `Up to ${MAX_COMPARE} experiments` : 'Add an experiment…'}
        options={options}
      />
    </div>
  );
}

function DiffTable({ items, scopeLabel, today }) {
  const [base] = items;
  const budget = (x) =>
    [x.budget ? fmtCurrency(x.budget) : null, x.dailyBudget ? `${fmtCurrency(x.dailyBudget)} a day` : null].filter(Boolean).join(' · ') || DASH;
  const rows = [
    { key: 'product', label: 'Product', value: (x) => x.product?.name ?? DASH, same: (x) => x.productId === base.productId },
    ...EXPERIMENT_VARIABLES.map(({ key, label }) => ({
      key,
      label,
      value: (x) => fmtVariable(key, x.variables?.[key]),
      same: (x) => !changedVariables(base.variables, x.variables).includes(key),
    })),
    {
      key: 'dates',
      label: LABELS.variable.dates,
      value: (x) => experimentSpan(x, today),
      same: (x) => durationDays(x, today) === durationDays(base, today),
    },
    { key: 'budget', label: LABELS.variable.budget, value: budget, same: (x) => budget(x) === budget(base) },
  ];
  const cell = 'min-w-40 px-3 py-2 align-top';
  const stick = 'sticky left-0 z-10 w-28 bg-canvas pr-3 whitespace-nowrap';
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <CardHeader
        title="What changed"
        subtitle={`Shaded cells differ from ${base.name}, the baseline. Duration is compared, not calendar dates.`}
      />
      <div className="relative mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-hairline">
              <th scope="col" className={`${stick} py-2 font-medium text-muted`}>
                Variable
              </th>
              {items.map((x, i) => (
                <th key={x._id} scope="col" className={`${cell} font-medium text-ink`}>
                  {x.name}
                  {i === 0 && <span className="block text-xs font-normal text-muted">Baseline</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-hairline-soft">
                <th scope="row" className={`${stick} py-2 align-top font-normal text-muted`}>
                  {r.label}
                </th>
                {items.map((x, i) => {
                  const changed = i > 0 && !r.same(x);
                  return (
                    <td key={x._id} className={`${cell} ${changed ? 'bg-tint font-medium text-ink' : 'text-body'}`}>
                      {r.value(x)}
                      {changed && <span className="sr-only"> (differs from baseline)</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="colgroup" colSpan={items.length + 1} className="pt-5 pb-1.5 text-xs font-medium text-muted">
                Results · {scopeLabel}
              </th>
            </tr>
            {RESULTS.map((k) => (
              <tr key={k} className="border-b border-hairline-soft last:border-0">
                <th scope="row" className={`${stick} py-2 font-normal text-muted`}>
                  {METRICS[k].label}
                </th>
                {items.map((x) => (
                  <td key={x._id} className={`${cell} text-ink tabular-nums`}>
                    {x.hasData ? fmtMetric(k, x[k]) : DASH}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function ExperimentComparePage() {
  const { today } = useDateRange();
  const search = useSearchParamState();
  const linked = parseIds(search.get('ids'));
  const ids = linked.slice(-MAX_COMPARE);
  const scope = useScope();
  const catalog = useList('experiments', {});
  const query = useAnalytics('experiments', { ids, ...scope.params }, { enabled: ids.length > 1 });

  const loaded = new Map((query.data?.items ?? []).map((x) => [x._id, x]));
  const items = ids.map((id) => loaded.get(id)).filter(Boolean);
  const known = new Map([...(catalog.data?.items ?? []).map((x) => [x._id, x]), ...loaded]);
  const small = items.filter(isSmallSample);
  const idle = items.filter((x) => !x.hasData);
  const settled = query.isSuccess && !query.isPlaceholderData;
  const missing = settled ? ids.length - items.length : 0;
  const gone = missing ? `${plural(missing, 'experiment')} in this link no longer ${missing === 1 ? 'exists' : 'exist'}.` : null;
  const notes = [
    gone,
    idle.length > 0 && `No metrics ${scope.lifetime ? 'recorded' : 'in this period'} for ${idle.map((x) => x.name).join(', ')}.`,
  ]
    .filter(Boolean)
    .join(' ');
  const setIds = (next) => search.set('ids', next.join(','));
  const state = {
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error,
    onRetry: query.refetch,
    empty: !items.some((x) => x.hasData),
  };
  const bars = { items, state };
  const nameOf = (id) => loaded.get(id)?.name ?? '';

  return (
    <>
      <PageHeader
        back={{ to: '/experiments', label: 'Experiments' }}
        title="Compare experiments"
        description="Experiment history side by side. Differences show what happened, not what caused it."
      />
      <FilterBar>
        <ScopeControl scope={scope} />
      </FilterBar>
      <Selection ids={ids} known={known} catalog={catalog} onChange={setIds} />
      {linked.length > ids.length && (
        <p className="-mt-2 mb-4 text-[13px] text-muted">
          Showing the last {MAX_COMPARE} of the {linked.length} experiments in the link.
        </p>
      )}

      {ids.length < 2 || (settled && items.length < 2) ? (
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="Choose at least two experiments to compare."
            description={`${gone ? `${gone} ` : ''}Add them with the picker above, or tick rows on the Experiments page.`}
            action={
              <ButtonLink to="/experiments" size="sm">
                Go to experiments
              </ButtonLink>
            }
          />
        </Card>
      ) : query.error ? (
        <Card>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Card>
      ) : (
        <>
          {small.length > 0 && (
            <SmallSampleNote className="mb-4">
              Small sample — differences may be noise. {small.map((x) => `${x.name} (${fmtNumber(x.purchases)})`).join(', ')}{' '}
              {small.length === 1 ? 'has' : 'have'} fewer than {SMALL_SAMPLE_PURCHASES} purchases.
            </SmallSampleNote>
          )}
          {notes && !query.isPending && <p className="mb-4 text-[13px] text-muted">{notes}</p>}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MetricBars metric="cac" {...bars} />
            <MetricBars metric="roas" {...bars} />
            <ChartCard
              className="lg:col-span-2"
              title="Revenue vs ad spend"
              subtitle="Money in and money out for each experiment"
              height={260}
              {...state}
              table={{
                rowKey: '_id',
                rows: items,
                columns: [
                  { key: 'name', header: 'Experiment' },
                  ...['revenue', 'spend', 'roas', 'contribution'].map((k) => ({
                    key: k,
                    header: METRICS[k].label,
                    align: 'right',
                    format: (v) => fmtMetric(k, v),
                  })),
                ],
              }}
            >
              <ColumnChart
                data={items.map((x) => ({ id: x._id, revenue: x.revenue, spend: x.spend }))}
                xKey="id"
                xFormatter={(id) => truncate(nameOf(id), 22)}
                tooltipLabel={nameOf}
                format="currency"
                series={[
                  { key: 'revenue', label: 'Revenue', color: METRIC_COLORS.revenue },
                  { key: 'spend', label: 'Ad spend', color: METRIC_COLORS.spend },
                ]}
              />
            </ChartCard>
            <MetricBars metric="purchases" {...bars} />
            <MetricBars metric="aov" {...bars} />
            <MetricBars metric="conversionRate" {...bars} />
            <MetricBars metric="ctr" {...bars} />
          </div>

          <ChartCard
            className="mt-4"
            title="Funnels"
            subtitle="Where each experiment loses buyers, with the largest drop-off flagged"
            height={null}
            {...state}
            table={{
              rowKey: 'key',
              rows: FUNNEL_STAGES.map((s) => ({ key: s.key, label: s.label, ...Object.fromEntries(items.map((x) => [x._id, x[s.key]])) })),
              columns: [
                { key: 'label', header: 'Stage' },
                ...items.map((x) => ({ key: x._id, header: x.name, align: 'right', format: (v) => fmtNumber(v) })),
              ],
            }}
          >
            <div className={`grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2 ${[2, 4].includes(items.length) ? '' : 'xl:grid-cols-3'}`}>
              {items.map((x) => (
                <div key={x._id} className="min-w-0">
                  <p className="mb-3 truncate text-[13px] font-medium text-ink">{x.name}</p>
                  {x.hasData ? <Funnel totals={x} compact /> : <p className="py-6 text-center text-[13px] text-muted">No metrics yet.</p>}
                </div>
              ))}
            </div>
          </ChartCard>

          <div className="mt-4">
            {items.length > 1 ? (
              <DiffTable items={items} scopeLabel={scope.label} today={today} />
            ) : (
              <Skeleton className="h-80" />
            )}
          </div>
        </>
      )}
    </>
  );
}
