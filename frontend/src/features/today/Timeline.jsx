import { Fragment } from 'react';
import { Circle, CircleCheck, Pencil } from 'lucide-react';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { fmtDuration } from '../../lib/format.js';
import { blockColor, blockEnd, blockLabel, blockRange, canComplete, countsTowardProgress } from './useTodaySummary.js';

function NowLine({ time }) {
  return (
    <li className="flex items-center gap-1.5 py-0.5">
      <span className="w-11 text-[11px] font-semibold text-primary tabular-nums">
        <span className="sr-only">Now, </span>
        {time}
      </span>
      <span className="h-px flex-1 bg-primary" aria-hidden />
      <span className="size-2 rounded-full bg-primary" aria-hidden />
    </li>
  );
}

function Row({ block: b, time, onToggle }) {
  const current = b.state === 'current';
  const past = b.state === 'past';
  const toggle = canComplete(b);
  return (
    <li className="relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
      {current ? (
        <span
          className="absolute left-0 z-10 flex w-[3.25rem] -translate-y-1/2 items-center gap-1"
          style={{ top: `${Math.round(b.elapsed * 100)}%` }}
          aria-hidden
        >
          <span className="text-[11px] font-semibold text-primary tabular-nums">{time}</span>
          <span className="h-px flex-1 bg-primary" />
          <span className="-mr-1 size-2 shrink-0 rounded-full bg-primary ring-2 ring-canvas" />
        </span>
      ) : (
        <time className={`pt-3 text-xs tabular-nums ${past ? 'text-faint' : 'text-body'}`}>{b.start}</time>
      )}
      <div
        className={`relative col-start-2 flex min-h-13 items-center gap-2 rounded-md border py-1.5 pl-4 ${
          current ? 'border-tint-strong bg-tint' : 'border-hairline-soft'
        } ${toggle ? 'pr-1' : 'pr-3'}`}
      >
        <span
          className="absolute inset-y-2 left-1.5 w-1 rounded-full"
          style={{ backgroundColor: blockColor(b), opacity: past ? 0.45 : 1 }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm ${current ? 'font-semibold text-ink' : past ? 'text-muted' : 'font-medium text-ink'}`}>{b.name}</p>
          <p className="truncate text-xs text-muted">
            {blockLabel(b)} · {current ? `${blockRange(b)} · ${fmtDuration(b.remaining)} left` : `until ${blockEnd(b)}`}
          </p>
          {current && <span className="sr-only">Now, {time}</span>}
        </div>
        {toggle ? (
          <button
            type="button"
            onClick={() => onToggle(b)}
            aria-pressed={b.completed}
            aria-label={`${b.name} done`}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-faint transition-colors hover:bg-tint-strong hover:text-ink"
          >
            {b.completed ? <CircleCheck className="size-5 fill-positive text-canvas" aria-hidden /> : <Circle className="size-5" aria-hidden />}
          </button>
        ) : (
          <span className="shrink-0 text-xs text-faint tabular-nums">{fmtDuration(b.minutes)}</span>
        )}
      </div>
    </li>
  );
}

export function Timeline({ blocks, time, onToggle, className = '' }) {
  if (!blocks.length) return null;
  const work = blocks.filter(countsTowardProgress);
  const done = work.filter((b) => b.completed).length;
  const upcoming = blocks.findIndex((b) => b.state === 'upcoming');
  const gap = blocks.some((b) => b.state === 'current') ? -1 : upcoming === -1 ? blocks.length : upcoming;
  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Schedule"
        subtitle={work.length ? `${done} of ${work.length} blocks done` : null}
        actions={
          <ButtonLink to="/plan" size="sm" variant="ghost" icon={Pencil}>
            Edit
          </ButtonLink>
        }
        className="mb-4"
      />
      <ol className="space-y-1.5" aria-label="Today's time blocks">
        {blocks.map((b, i) => (
          <Fragment key={b.carry ? `${b._id}-carry` : b._id}>
            {i === gap && <NowLine time={time} />}
            <Row block={b} time={time} onToggle={onToggle} />
          </Fragment>
        ))}
        {gap === blocks.length && <NowLine time={time} />}
      </ol>
    </Card>
  );
}
