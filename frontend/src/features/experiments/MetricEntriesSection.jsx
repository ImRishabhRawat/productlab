import { useRef } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { PAGE_SIZE, PagedList, usePaging } from '../../components/ui/PagedList.jsx';
import { Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState } from '../../components/ui/States.jsx';
import { DASH, fmtDate, fmtMetric, plural } from '../../lib/format.js';
import { metricColumn, shortLabel } from '../../lib/metricDisplay.js';
import { useList } from '../../lib/queries.js';

const ENTERED = ['spend', 'impressions', 'clicks', 'landingPageViews', 'checkouts', 'purchases', 'revenue'];
const DERIVED = ['ctr', 'cac', 'roas'];

export function MetricEntriesSection({ experimentId, params, onRecord, onEdit, onDelete }) {
  const filters = { experimentId, ...params };
  const [offset, setOffset] = usePaging(filters);
  const query = useList('metrics', { ...filters, limit: PAGE_SIZE, offset });
  const total = query.data?.total ?? 0;
  const top = useRef(null);
  const goTo = (next) => {
    setOffset(next);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const columns = [
    { key: 'date', header: 'Date', format: (v) => fmtDate(v, { year: true }), className: 'whitespace-nowrap' },
    {
      key: 'creativeName',
      header: 'Creative',
      render: (r) => (
        <span className="block max-w-32 truncate" title={r.creativeName || undefined}>
          {r.creativeName || DASH}
        </span>
      ),
    },
    ...ENTERED.map((k) => metricColumn(k)),
    ...DERIVED.map((k) => ({
      key: k,
      header: shortLabel(k),
      align: 'right',
      render: (r) => <span className="text-muted">{fmtMetric(k, r.derived?.[k])}</span>,
      sortValue: (r) => r.derived?.[k],
    })),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      sortable: false,
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-0.5">
          <IconButton icon={Pencil} size="icon-sm" label={`Edit entry for ${fmtDate(r.date)}`} onClick={() => onEdit(r)} />
          <IconButton icon={Trash2} size="icon-sm" label={`Delete entry for ${fmtDate(r.date)}`} onClick={() => onDelete(r)} />
        </div>
      ),
    },
  ];

  return (
    <Section
      title="Metric entries"
      description={total ? `${plural(total, 'entry', 'entries')}, newest first. Rates are calculated, never typed.` : 'What the ad platform reported, day by day'}
      actions={
        <Button size="sm" icon={Plus} onClick={onRecord}>
          Record metrics
        </Button>
      }
    >
      <Card ref={top} className="min-w-0 scroll-mt-16 overflow-hidden">
        <PagedList
          query={query}
          offset={offset}
          onPage={goTo}
          empty={
            <EmptyState
              compact
              title={params.from ? 'No metric entries in this period.' : 'No metric entries yet.'}
              description="Each day you record for this experiment appears here."
            />
          }
        >
          <div className="px-1 sm:px-2">
            <DataTable columns={columns} rows={query.data?.items ?? []} dense />
          </div>
        </PagedList>
      </Card>
    </Section>
  );
}
