import { ArrowRight } from 'lucide-react';
import { ProgressRing } from '../../components/charts/ProgressRing.jsx';
import { Dot } from '../../components/ui/Badge.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { fmtDuration } from '../../lib/format.js';
import { blockColor, useTodaySummary } from './useTodaySummary.js';

export function TodayStrip({ className = '' }) {
  const { query, data, time, blocks, current, next } = useTodaySummary();

  if (!data) {
    if (!query.error) return <Skeleton className={`h-28 sm:h-24 ${className}`} />;
    return (
      <Card className={className}>
        <p className="px-4 pt-4 text-xs font-medium text-muted">Today</p>
        <ErrorState compact error={query.error} onRetry={query.refetch} />
      </Card>
    );
  }

  const block = current ?? next;
  const outcome = data.outcome;
  return (
    <Card className={`flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5 ${className}`}>
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <ProgressRing value={data.progress.score} size={60} stroke={6} label="Today's progress" />
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">
              {current || !block ? 'Now' : 'Up next'} · <span className="tabular-nums">{time}</span>
            </p>
            {block ? (
              <>
                <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-medium text-ink">
                  <Dot color={blockColor(block)} />
                  <span className="truncate">{block.name}</span>
                </p>
                <p className="text-xs text-muted">{current ? `${fmtDuration(current.remaining)} left` : `${block.start} · in ${fmtDuration(block.startsIn)}`}</p>
              </>
            ) : (
              <p className="text-[15px] text-muted">{blocks.length ? 'Nothing scheduled right now' : 'No time blocks planned today'}</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">#1 outcome</p>
            <p className={`truncate text-[15px] font-medium ${outcome?.title ? 'text-ink' : 'text-muted'}`}>{outcome?.title || 'Not set yet'}</p>
            {outcome?.title && <p className="text-xs text-muted">{outcome.done ? 'Done' : 'Not done yet'}</p>}
          </div>
        </div>
      </div>
      <ButtonLink to="/today" size="sm" className="self-start sm:self-center">
        Open Today
        <ArrowRight className="size-4" aria-hidden />
      </ButtonLink>
    </Card>
  );
}
