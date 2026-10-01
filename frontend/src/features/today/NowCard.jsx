import { CalendarClock, Check, CircleCheck, NotebookPen, Plus } from 'lucide-react';
import { Meter } from '../../components/charts/Meter.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { EmptyState } from '../../components/ui/States.jsx';
import { fmtDuration } from '../../lib/format.js';
import { blockColor, blockLabel, blockRange, canComplete } from './useTodaySummary.js';

const blockMeta = (b) => `${blockLabel(b)} · ${blockRange(b)}`;

export function NowCard({ blocks, current, next, time, reviewed, onToggle, onReview, className = '' }) {
  if (!blocks.length) {
    return (
      <Card className={`p-4 sm:p-5 ${className}`}>
        <EmptyState
          compact
          icon={CalendarClock}
          title="Nothing planned for today."
          description="Add time blocks and this card shows what to do right now."
          action={
            <ButtonLink to="/plan" variant="primary" icon={Plus}>
              Plan your day
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  const block = current ?? next;
  return (
    <Card className={`relative overflow-hidden p-4 pl-5 sm:p-5 sm:pl-6 ${className}`}>
      {block && <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: blockColor(block) }} aria-hidden />}
      <p className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">
        {!current && next ? 'Up next' : 'Now'} <span className="font-medium tabular-nums">· {time}</span>
      </p>
      {block ? (
        <h2 className="mt-1 text-2xl leading-tight font-semibold tracking-[-0.02em] break-words text-ink sm:text-[28px]">{block.name}</h2>
      ) : (
        <>
          <h2 className="mt-1 text-xl leading-tight font-semibold tracking-[-0.01em] text-ink">Nothing scheduled right now</h2>
          <p className="mt-1 text-[13px] text-muted">
            {reviewed ? 'Today’s schedule is done and the day is reviewed.' : 'Today’s schedule is done. Close the day with a short review.'}
          </p>
          {!reviewed && (
            <Button icon={NotebookPen} className="mt-3" onClick={onReview}>
              Review your day
            </Button>
          )}
        </>
      )}
      {current ? (
        <div className="mt-3">
          <Meter
            value={current.minutes - current.remaining}
            max={current.minutes}
            label={blockMeta(current)}
            valueLabel={`${fmtDuration(current.remaining)} left`}
            height={6}
          />
        </div>
      ) : (
        next && (
          <p className="mt-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 text-body">{blockMeta(next)}</span>
            <span className="font-medium whitespace-nowrap text-ink">in {fmtDuration(next.startsIn)}</span>
          </p>
        )
      )}
      {current && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline-soft pt-3">
          <p className="min-w-0 text-[13px] text-muted">
            {next ? (
              <>
                Next <span className="font-medium text-ink">{next.name}</span> at <span className="tabular-nums">{next.start}</span> · in{' '}
                {fmtDuration(next.startsIn)}
              </>
            ) : (
              'Last block of the day'
            )}
          </p>
          {canComplete(current) && (
            <Button
              variant={current.completed ? 'secondary' : 'primary'}
              icon={current.completed ? CircleCheck : Check}
              aria-pressed={current.completed}
              onClick={() => onToggle(current)}
              className="max-lg:hidden"
            >
              {current.completed ? 'Block done' : 'Complete block'}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
