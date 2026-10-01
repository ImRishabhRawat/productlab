import { useState } from 'react';
import { ClipboardPlus, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { LABELS, METRICS, SMALL_SAMPLE_PURCHASES } from '@product-lab/shared/constants';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { fmtDate } from '../../lib/format.js';
import { betterHint, measured, metricOptions, shortLabel } from '../../lib/metricDisplay.js';
import { isSmallSample, mutedFor } from './ExperimentParts.jsx';

const RESULT_METRICS = ['cac', 'purchases', 'roas', 'revenue'];
const TABLE_METRICS = ['spend', 'impressions', 'ctr', 'cpc', 'landingPageViews', 'checkouts', 'purchases', 'cac', 'roas', 'revenue'];

function BarBlock({ metric, items, control }) {
  return (
    <div className="min-w-0">
      <div className="mb-3 flex min-h-7 flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-muted">
          {shortLabel(metric)} · {betterHint(metric).toLowerCase()}
        </h3>
        {control}
      </div>
      <BarList
        format={METRICS[metric].format}
        labelWidth="min(11rem, 34vw)"
        items={items.map((c) => ({ key: c._id, label: c.name, value: c.hasData ? c[metric] : null, muted: mutedFor(metric, c) }))}
      />
    </div>
  );
}

function placement(c, campaign) {
  return [c.campaign !== campaign && c.campaign, c.adSet, c.startDate && `from ${fmtDate(c.startDate)}`].filter(Boolean).join(' · ');
}

export function CreativesSection({ query, scoped, campaign, onAdd, onRecord, onEdit, onDelete }) {
  const [metric, setMetric] = useState('cac');
  const items = query.data?.items ?? [];
  const withData = items.filter((c) => c.hasData);
  const small = withData.filter(isSmallSample);
  const smallShare = small.length === items.length ? 'Every creative has' : `${small.length} of ${items.length} creatives have`;
  const note =
    withData.length > 1
      ? null
      : withData.length
        ? `Only one creative has results${scoped ? ' in this period' : ''}, so there is nothing to compare yet.`
        : scoped
          ? 'No creative metrics in this period.'
          : 'No metrics tagged with a creative yet.';
  const columns = [
    {
      key: 'name',
      header: 'Creative',
      render: (c) => (
        <div className="max-w-52 min-w-44">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-ink" title={c.name}>
              {c.name}
            </span>
            {c.format && <Badge className="shrink-0">{LABELS.creativeFormat[c.format]}</Badge>}
          </div>
          {(c.angle || c.hook) && (
            <p className="mt-0.5 truncate text-xs text-muted" title={[c.angle, c.hook].filter(Boolean).join(' · ')}>
              {c.angle && <span className="text-body">{c.angle}</span>}
              {c.angle && c.hook && ' · '}
              {c.hook}
            </p>
          )}
          {placement(c, campaign) && (
            <p className="mt-0.5 truncate text-xs text-muted" title={placement(c, campaign)}>
              {placement(c, campaign)}
            </p>
          )}
        </div>
      ),
    },
    ...TABLE_METRICS.map((k) => ({ key: k, header: shortLabel(k), align: 'right', format: measured(k) })),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      sortable: false,
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={ClipboardPlus} size="icon-sm" label={`Record metrics for ${c.name}`} onClick={() => onRecord(c)} />
          <IconButton icon={Pencil} size="icon-sm" label={`Edit ${c.name}`} onClick={() => onEdit(c)} />
          <IconButton icon={Trash2} size="icon-sm" label={`Delete ${c.name}`} onClick={() => onDelete(c)} />
        </div>
      ),
    },
  ];

  return (
    <Section
      title="Creatives"
      description="Results come from metric entries tagged with each creative"
      actions={
        <Button size="sm" icon={ImagePlus} onClick={onAdd}>
          Add creative
        </Button>
      }
    >
      {query.error ? (
        <Card>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Card>
      ) : query.isSuccess && !items.length ? (
        <Card>
          <EmptyState
            compact
            icon={ImagePlus}
            title="No creatives yet."
            description="Add each ad you run to see which hook and angle turn into buyers."
          />
        </Card>
      ) : (
        <>
          {query.isSuccess && note ? (
            <p className="text-[13px] text-muted">{note}</p>
          ) : (
            <ChartCard
              title="Creative performance"
              subtitle="Does the hook earn the click, and does the click turn into a buyer?"
              height={null}
              loading={query.isPending}
              fetching={query.isFetching}
              insight={
                small.length
                  ? `${smallShare} fewer than ${SMALL_SAMPLE_PURCHASES} purchases, so differences may be noise. Grey bars mark them.`
                  : null
              }
              table={{
                rowKey: '_id',
                rows: items,
                columns: [
                  { key: 'name', header: 'Creative' },
                  ...['impressions', 'reach', 'clicks', 'ctr', ...(metric === 'purchases' ? [] : ['purchases']), metric].map((k) => ({
                    key: k,
                    header: shortLabel(k),
                    align: 'right',
                    format: measured(k),
                  })),
                ],
              }}
            >
              <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
                <BarBlock metric="ctr" items={items} />
                <BarBlock
                  metric={metric}
                  items={items}
                  control={
                    <SegmentedControl
                      size="sm"
                      label="Result metric"
                      options={metricOptions(RESULT_METRICS)}
                      value={metric}
                      onChange={setMetric}
                    />
                  }
                />
              </div>
            </ChartCard>
          )}
          {items.length > 0 && (
            <Card className="mt-4 min-w-0 px-1 sm:px-2">
              <DataTable columns={columns} rows={items} />
            </Card>
          )}
        </>
      )}
    </Section>
  );
}
