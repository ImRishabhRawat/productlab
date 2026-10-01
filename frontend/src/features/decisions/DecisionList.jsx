import { Gavel } from 'lucide-react';
import { LABELS } from '@product-lab/shared/constants';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { fmtDate, fmtMetric } from '../../lib/format.js';
import { shortLabel } from '../../lib/metricDisplay.js';

const EVIDENCE = ['purchases', 'revenue', 'cac', 'roas'];

export function DecisionList({ query, onRecord }) {
  const items = query.data?.items ?? [];
  if (query.isPending) return <Skeleton className="h-24" />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} compact />;
  if (!items.length) {
    return (
      <EmptyState
        compact
        icon={Gavel}
        title="No decisions yet."
        description="Record one when the evidence is clear enough to act on."
        action={
          onRecord && (
            <Button size="sm" onClick={onRecord}>
              Record decision
            </Button>
          )
        }
      />
    );
  }
  return (
    <ol className="@container divide-y divide-hairline-soft">
      {items.map((d) => (
        <li key={d._id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 @xl:flex-row @xl:gap-4">
          <div className="flex shrink-0 items-center justify-between gap-2 @xl:w-36 @xl:flex-col @xl:items-start @xl:justify-start @xl:gap-1">
            <StatusBadge kind="decision" value={d.decision} />
            <time dateTime={d.date} className="text-xs text-muted">
              {fmtDate(d.date, { year: true })}
            </time>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink">{d.reason}</p>
            {d.notes && <p className="mt-0.5 text-[13px] text-muted">{d.notes}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted">Evidence then</span>
              {EVIDENCE.map((key) => (
                <Badge key={key}>
                  {shortLabel(key)} <span className="text-ink tabular-nums">{fmtMetric(key, d.evidence?.[key])}</span>
                </Badge>
              ))}
            </div>
            {d.statusTo && d.statusTo !== d.statusFrom && (
              <p className="mt-1.5 text-xs text-muted">
                Product: {d.statusFrom && `${LABELS.status[d.statusFrom]} → `}
                {LABELS.status[d.statusTo]}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
