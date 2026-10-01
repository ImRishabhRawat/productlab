import { useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { LABELS, METRICS } from '@product-lab/shared/constants';
import { changedVariables } from '@product-lab/shared/metrics';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ScatterPlot } from '../../components/charts/ScatterPlot.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtCurrency, fmtMetric, fmtRange, fmtRatio, plural } from '../../lib/format.js';
import { betterHint, measured, metricOptions, ranked } from '../../lib/metricDisplay.js';
import { useAnalytics } from '../../lib/queries.js';
import { byStart, experimentDates } from '../experiments/ExperimentParts.jsx';

const METRIC_OPTIONS = metricOptions(['cac', 'roas', 'conversionRate', 'revenue', 'purchases']);

function breakEvenInsight(metric, rows, be) {
  if (metric === 'cac' && be.breakEvenCac > 0) {
    return `${rows.filter((x) => x.cac <= be.breakEvenCac).length} of ${plural(rows.length, 'test')} bought customers under the ${fmtCurrency(be.breakEvenCac)} break-even CAC.`;
  }
  if (metric === 'roas' && be.breakEvenRoas) {
    return `${rows.filter((x) => x.roas >= be.breakEvenRoas).length} of ${plural(rows.length, 'test')} cleared the ${fmtRatio(be.breakEvenRoas)} break-even ROAS.`;
  }
  return null;
}

function Changed({ experiment: x, keys }) {
  const text = x.changeNote || (keys == null ? 'First test' : keys.length ? null : 'Same setup as the previous test');
  return (
    <div className="min-w-[13rem]">
      {text && <p className="text-body">{text}</p>}
      {keys?.length > 0 && (
        <div className={`flex flex-wrap gap-1 ${text ? 'mt-1' : ''}`}>
          {keys.map((k) => (
            <Badge key={k}>{LABELS.variable[k]}</Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductExperiments({ product, breakEven: be, onCreate }) {
  const range = useDateRange();
  const [metric, setMetric] = useState('cac');
  const query = useAnalytics('experiments', { from: range.params.from, to: range.params.to, productId: product._id });
  const items = query.data?.items ?? [];

  if (query.isPending) return <Skeleton className="h-80" />;
  if (query.error) {
    return (
      <Card>
        <ErrorState error={query.error} onRetry={query.refetch} />
      </Card>
    );
  }
  if (!items.length) {
    return (
      <Card>
        <EmptyState
          icon={FlaskConical}
          title="No experiments yet."
          description="Test one change at a time to learn what moves CAC."
          action={
            <Button variant="primary" icon={Plus} onClick={onCreate}>
              New experiment
            </Button>
          }
        />
      </Card>
    );
  }

  const active = items.filter((x) => x.hasData);
  const bars = ranked(items, metric);
  const history = [...items].sort(byStart);
  const changes = new Map(history.map((x, i) => [x._id, i ? changedVariables(history[i - 1].variables, x.variables) : null]));
  const period = range.range.from ? fmtRange(range.range) : 'all time';
  const earlier = range.range.from ? items.filter((x) => !x.hasData && x.startDate < range.range.from).length : 0;
  const showAll = () => range.setPreset('all');

  const columns = [
    {
      key: 'name',
      header: 'Experiment',
      render: (x) => (
        <div className="min-w-[10rem]">
          <Link to={`/experiments/${x._id}`} className="font-medium text-ink hover:underline">
            {x.name}
          </Link>
          <div className="mt-1">
            <StatusBadge kind="experimentStatus" value={x.status} />
          </div>
        </div>
      ),
    },
    {
      key: 'startDate',
      header: 'Dates',
      sortValue: (x) => history.indexOf(x),
      render: (x) => <span className="whitespace-nowrap text-body">{experimentDates(x)}</span>,
    },
    { key: 'changed', header: 'What changed', sortable: false, render: (x) => <Changed experiment={x} keys={changes.get(x._id)} /> },
    { key: 'spend', header: 'Spend', align: 'right', format: measured('spend') },
    { key: 'purchases', header: 'Purchases', align: 'right', format: measured('purchases') },
    { key: 'cac', header: 'CAC', align: 'right', format: measured('cac') },
    { key: 'roas', header: 'ROAS', align: 'right', format: measured('roas') },
  ];

  return (
    <>
      {!active.length ? (
        <Card>
          <EmptyState
            compact
            icon={FlaskConical}
            title="No experiment activity in this period."
            description={earlier ? 'Some tests ran before this period.' : 'Record daily metrics for a test to compare CAC and ROAS here.'}
            action={
              earlier > 0 && (
                <Button size="sm" onClick={showAll}>
                  Show all time
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title={`${METRICS[metric].label} by experiment`}
            subtitle={betterHint(metric)}
            height={null}
            fetching={query.isFetching}
            empty={!bars.length}
            emptyMessage="No values for this metric in this period."
            toolbar={<SegmentedControl size="sm" label="Metric" options={METRIC_OPTIONS} value={metric} onChange={setMetric} />}
            table={{
              columns: [
                { key: 'name', header: 'Experiment' },
                { key: metric, header: METRICS[metric].label, align: 'right', format: (v) => fmtMetric(metric, v) },
              ],
              rows: bars,
            }}
            insight={breakEvenInsight(metric, bars, be)}
          >
            <BarList
              format={METRICS[metric].format}
              labelWidth="min(13rem, 45%)"
              items={bars.map((x) => ({ key: x._id, label: x.name, value: x[metric], href: `/experiments/${x._id}` }))}
            />
          </ChartCard>
          <ChartCard
            title="Spend vs purchases"
            subtitle={be.breakEvenCac > 0 ? 'Dots above the line bought customers under break-even CAC' : 'Each dot is an experiment'}
            height={280}
            fetching={query.isFetching}
            table={{
              columns: [
                { key: 'name', header: 'Experiment' },
                { key: 'spend', header: 'Spend', align: 'right', format: (v) => fmtCurrency(v) },
                { key: 'purchases', header: 'Purchases', align: 'right' },
                { key: 'cac', header: 'CAC', align: 'right', format: (v) => fmtMetric('cac', v) },
              ],
              rows: active,
            }}
          >
            <ScatterPlot
              data={active}
              x={{ key: 'spend', label: 'Ad spend', format: 'currency' }}
              y={{ key: 'purchases', label: 'Purchases', format: 'number' }}
              reference={be.breakEvenCac > 0 ? { slope: 1 / be.breakEvenCac, label: `Break-even CAC ${fmtCurrency(be.breakEvenCac)}` } : undefined}
              extraRows={(x) => [
                { label: 'CAC', value: fmtMetric('cac', x.cac) },
                { label: 'ROAS', value: fmtMetric('roas', x.roas) },
              ]}
            />
          </ChartCard>
        </div>
      )}

      <Section
        title="Experiment history"
        description={
          <>
            {plural(items.length, 'test')}, newest first · metrics for {period}
            {earlier > 0 && (
              <>
                {' · '}
                <button type="button" onClick={showAll} className="text-ink underline-offset-2 hover:underline">
                  {earlier} ran before this period, show all time
                </button>
              </>
            )}
          </>
        }
        actions={
          <div className="flex items-center gap-1.5">
            {items.length > 1 && (
              <ButtonLink to={`/experiments/compare?ids=${history.slice(-20).map((x) => x._id).join(',')}`} size="sm" variant="ghost">
                Compare all
              </ButtonLink>
            )}
            <Button size="sm" icon={Plus} onClick={onCreate}>
              New experiment
            </Button>
          </div>
        }
      >
        <Card className={`min-w-0 overflow-hidden transition-opacity ${query.isFetching ? 'opacity-60' : ''}`}>
          <DataTable columns={columns} rows={[...history].reverse()} />
        </Card>
      </Section>
    </>
  );
}
