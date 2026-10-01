import { Link, useNavigate } from 'react-router';
import { METRICS } from '@product-lab/shared/constants';
import { pctChange } from '@product-lab/shared/metrics';
import { Delta } from '../../components/charts/KpiTile.jsx';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { fmtMetric } from '../../lib/format.js';
import { metricColumn } from '../../lib/metricDisplay.js';

const KEYS = ['spend', 'revenue', 'contribution', 'contributionMargin', 'purchases', 'cac', 'roas', 'aov', 'conversionRate', 'ctr'];
const TRACKED = ['revenue', 'contribution', 'purchases', 'cac', 'roas', 'conversionRate'];

function columnsFor(previous) {
  const byId = new Map((previous ?? []).map((p) => [p._id, p]));
  const withChange = (k) => ({
    ...metricColumn(k),
    render: (p) => (
      <>
        {fmtMetric(k, p[k])}
        <div>
          <Delta value={pctChange(p[k], byId.get(p._id)?.[k])} better={METRICS[k].better} />
        </div>
      </>
    ),
  });
  return [
    {
      key: 'name',
      header: 'Product',
      className: 'min-w-40',
      render: (p) => (
        <Link to={`/products/${p._id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: 'status', header: 'Status', render: (p) => <StatusBadge value={p.status} /> },
    ...KEYS.map((k) => (previous && TRACKED.includes(k) ? withChange(k) : metricColumn(k))),
  ];
}

export function ProductComparison({ products, previous }) {
  const navigate = useNavigate();
  const rows = (products.data?.items ?? []).filter((p) => p.hasData);
  const fetching = products.isFetching || previous?.isFetching;
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      {products.isPending ? (
        <Skeleton className="h-48" />
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={products.refetch} compact />
      ) : rows.length ? (
        <div className={`transition-opacity duration-200 ${fetching ? 'opacity-60' : ''}`}>
          <DataTable columns={columnsFor(previous?.data?.items)} rows={rows} initialSort={{ key: 'revenue', dir: 'desc' }} onRowClick={(p) => navigate(`/products/${p._id}`)} />
        </div>
      ) : (
        <EmptyState compact title="No product activity in this period." />
      )}
    </Card>
  );
}
