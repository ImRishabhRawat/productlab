import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtNumber } from '../../lib/format.js';
import { Button } from './Button.jsx';
import { EmptyState, ErrorState, Skeleton } from './States.jsx';

export const PAGE_SIZE = 50;

export function usePaging(filters) {
  const signature = JSON.stringify(filters);
  const [state, setState] = useState({ signature, offset: 0 });
  return [state.signature === signature ? state.offset : 0, (offset) => setState({ signature, offset })];
}

function Body({ query, offset, onPage, empty, children }) {
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} />;
  if (query.isPending) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (!query.data.items.length) {
    if (!offset) return empty;
    return (
      <EmptyState
        compact
        title="Nothing on this page."
        action={
          <Button size="sm" onClick={() => onPage(0)}>
            Back to first page
          </Button>
        }
      />
    );
  }
  return <div className={`transition-opacity duration-200 ${query.isFetching ? 'opacity-60' : ''}`}>{children}</div>;
}

export function PagedList({ query, offset, onPage, empty, children }) {
  const total = query.data?.total ?? 0;
  const end = Math.min(offset + PAGE_SIZE, total);
  return (
    <>
      <Body query={query} offset={offset} onPage={onPage} empty={empty}>
        {children}
      </Body>
      {total > 0 && !query.error && (
        <div className="flex items-center justify-between gap-3 border-t border-hairline-soft px-3 py-2.5">
          <span className="text-[13px] text-muted tabular-nums">
            {fmtNumber(Math.min(offset + 1, total))}–{fmtNumber(end)} of {fmtNumber(total)}
          </span>
          <div className="flex items-center gap-1.5">
            <Button size="sm" icon={ChevronLeft} disabled={offset === 0} onClick={() => onPage(Math.max(offset - PAGE_SIZE, 0))}>
              Prev
            </Button>
            <Button size="sm" disabled={end >= total} onClick={() => onPage(offset + PAGE_SIZE)}>
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
