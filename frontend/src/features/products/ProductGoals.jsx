import { Target } from 'lucide-react';
import { Link } from 'react-router';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtDuration, plural } from '../../lib/format.js';
import { useGet, useList } from '../../lib/queries.js';
import { GoalRow, SessionList, goalSource } from '../goals/GoalParts.jsx';
import { BlockSummaryList } from '../plan/PlanParts.jsx';
import { weeklyMinutes } from '../plan/schedule.js';
import { CORRELATION, sumOf } from '../reviews/ReviewParts.jsx';

const GOALS = 4;
const SESSIONS = 3;
const link = 'relative inline-block text-ink underline-offset-2 hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3';

function Part({ title, meta, queries, children }) {
  const error = queries.find((q) => q.error)?.error;
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
        {meta && <span className="truncate text-xs text-muted">{meta}</span>}
      </div>
      {queries.some((q) => q.isPending) ? (
        <Skeleton className="h-24" />
      ) : error ? (
        <ErrorState compact error={error} onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : (
        <div className={`transition-opacity duration-200 ${queries.some((q) => q.isFetching) ? 'opacity-60' : ''}`}>{children}</div>
      )}
    </div>
  );
}

export function ProductGoals({ productId, className = '' }) {
  const range = useDateRange();
  const goals = useList('goals');
  const focus = useGet('/productivity/series', { ...range.range, productId });
  const sessions = useList('focus-sessions', { productId, ...range.range, limit: 20 });
  const blocks = useList('time-blocks');

  const linked = (goals.data?.items ?? []).filter((g) => g.productIds.includes(productId));
  const points = focus.data?.points ?? [];
  const minutes = sumOf(points, 'focusMinutes');
  const count = sumOf(points, 'sessions');
  const recent = (sessions.data?.items ?? []).filter((s) => s.status !== 'cancelled');
  const scheduled = (blocks.data?.items ?? []).filter((b) => b.productId === productId);
  const weekly = weeklyMinutes(scheduled);
  const empty = goals.isSuccess && focus.isSuccess && blocks.isSuccess && !linked.length && !count && !scheduled.length;

  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <CardHeader title="Goals & focus" subtitle={empty ? null : 'Goals it counts toward, focus logged and time scheduled'} />
      {empty ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">No linked goals or time blocks, and no focus logged in this period.</p>
          <ButtonLink to="/goals" size="sm" icon={Target}>
            Link a goal
          </ButtonLink>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Part title="Goals" meta={linked.length > GOALS ? `${GOALS} of ${linked.length}` : null} queries={[goals]}>
            {linked.length ? (
              <ul className="-mx-2 space-y-1">
                {linked.slice(0, GOALS).map((g) => (
                  <li key={g._id}>
                    <GoalRow goal={g} note={goalSource(g)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">
                No goals linked.{' '}
                <Link to="/goals" className={link}>
                  Link a goal
                </Link>
              </p>
            )}
          </Part>

          <Part title="Focus" meta={range.label} queries={[focus, sessions]}>
            {count ? (
              <>
                <p className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">{fmtDuration(minutes)}</p>
                <p className="mt-1.5 text-xs text-muted">{plural(count, 'session')} logged</p>
                <SessionList sessions={recent.slice(0, SESSIONS)} meta={(s) => [s.experimentName || s.goalTitle]} className="mt-2" />
                {minutes > 0 && <p className="mt-2 text-xs text-muted">{CORRELATION}</p>}
              </>
            ) : (
              <p className="text-[13px] text-muted">No focus logged in this period.</p>
            )}
          </Part>

          <Part title="Time blocks" meta={weekly ? `${fmtDuration(weekly)} a week` : null} queries={[blocks]}>
            {scheduled.length ? (
              <BlockSummaryList blocks={scheduled} />
            ) : (
              <p className="text-[13px] text-muted">
                No time blocks linked.{' '}
                <Link to="/plan" className={link}>
                  Plan
                </Link>
              </p>
            )}
          </Part>
        </div>
      )}
    </Card>
  );
}
