import { useState } from 'react';
import { ChartLine, Table2 } from 'lucide-react';
import { IconButton } from '../ui/Button.jsx';
import { Card } from '../ui/Card.jsx';
import { DataTable } from '../ui/DataTable.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/States.jsx';

export function ChartCard({
  title,
  subtitle,
  value,
  actions,
  toolbar,
  table,
  height = 240,
  loading,
  fetching,
  error,
  onRetry,
  empty,
  emptyMessage = 'No data for this period.',
  emptyAction,
  insight,
  className = '',
  children,
}) {
  const [showTable, setShowTable] = useState(false);
  const fixed = height != null;
  const body = loading ? (
    <Skeleton style={{ height: height ?? 160 }} />
  ) : error ? (
    <ErrorState error={error} onRetry={onRetry} compact />
  ) : empty ? (
    <EmptyState compact title={emptyMessage} action={emptyAction} />
  ) : showTable && table ? (
    <DataTable {...table} dense maxHeight={fixed ? height : 320} />
  ) : (
    <div className={`transition-opacity duration-200 ${fetching ? 'opacity-60' : ''}`} style={fixed ? { height } : undefined}>
      {children}
    </div>
  );

  return (
    <Card className={`flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-medium text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {value != null && <div className="mr-1 text-right text-[15px] font-semibold text-ink">{value}</div>}
          {actions}
          {table && !loading && !error && !empty && (
            <IconButton
              size="icon-sm"
              icon={showTable ? ChartLine : Table2}
              label={showTable ? 'Show chart' : 'Show as table'}
              aria-pressed={showTable}
              onClick={() => setShowTable((s) => !s)}
            />
          )}
        </div>
      </div>
      {toolbar && <div className="mt-3 min-w-0">{toolbar}</div>}
      <div className="mt-4 min-w-0 flex-1">{body}</div>
      {insight && !loading && !error && !empty && <p className="mt-3 text-[13px] leading-snug text-muted">{insight}</p>}
    </Card>
  );
}
