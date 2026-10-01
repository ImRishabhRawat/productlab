import { useState } from 'react';
import { Link } from 'react-router';
import { LABELS, METRICS } from '@product-lab/shared/constants';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { plural } from '../../lib/format.js';
import { betterHint, colorFor, lowerIsBetter, metricColumn, metricOptions } from '../../lib/metricDisplay.js';

const RANK_BY = ['roas', 'ctr', 'cac', 'purchases'];

const COLUMNS = [
  {
    key: 'name',
    header: 'Creative',
    className: 'min-w-40',
    render: (c) => (
      <>
        <Link to={`/experiments/${c.experimentId}`} className="font-medium text-ink hover:underline">
          {c.name}
        </Link>
        <p className="text-xs text-muted">{c.experimentName}</p>
      </>
    ),
  },
  { key: 'format', header: 'Format', format: (v) => LABELS.creativeFormat[v] ?? v },
  ...['spend', 'impressions', 'ctr', 'cpc', 'cpm', 'purchases', 'conversionRate', 'cac', 'revenue', 'roas', 'contribution'].map((k) => metricColumn(k)),
];

export function CreativeLeaderboard({ creatives }) {
  const [metric, setMetric] = useState('roas');
  const items = (creatives.data?.items ?? []).filter((c) => c.hasData);
  const ranked = [...items].sort(
    (a, b) => (a[metric] == null) - (b[metric] == null) || (lowerIsBetter(metric) ? a[metric] - b[metric] : b[metric] - a[metric]),
  );
  const repeated = new Set(items.filter((c, i) => items.findIndex((o) => o.name === c.name) !== i).map((c) => c.name));
  const label = (c) => (repeated.has(c.name) ? `${c.name} — ${c.experimentName}` : c.name);

  return (
    <>
      <ChartCard
        title={`Creatives by ${METRICS[metric].label}`}
        subtitle={betterHint(metric)}
        height={null}
        loading={creatives.isPending}
        fetching={creatives.isFetching}
        error={creatives.error}
        onRetry={creatives.refetch}
        empty={!items.length}
        emptyMessage="No creative activity in this period."
        toolbar={<SegmentedControl size="sm" label="Rank by" options={metricOptions(RANK_BY)} value={metric} onChange={setMetric} />}
        table={{ rows: ranked, columns: [{ key: 'name', header: 'Creative' }, { key: 'experimentName', header: 'Experiment' }, metricColumn(metric)] }}
      >
        <BarList
          format={METRICS[metric].format}
          color={colorFor(metric)}
          labelWidth="min(20rem, 40vw)"
          items={ranked.map((c) => ({
            key: c._id,
            label: label(c),
            value: c[metric],
            href: `/experiments/${c.experimentId}`,
            display: metric === 'cac' && c.cac == null ? 'No sales' : undefined,
          }))}
        />
      </ChartCard>
      {items.length > 0 && (
        <Card className="mt-4 min-w-0 p-4 sm:p-5">
          <CardHeader title="All creative metrics" subtitle={`${plural(items.length, 'creative')} with activity`} className="mb-3" />
          <div className={`transition-opacity duration-200 ${creatives.isFetching ? 'opacity-60' : ''}`}>
            <DataTable columns={COLUMNS} rows={items} initialSort={{ key: 'spend', dir: 'desc' }} />
          </div>
        </Card>
      )}
    </>
  );
}
