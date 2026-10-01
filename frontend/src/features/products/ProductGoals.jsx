import { Target } from 'lucide-react';
import { Link } from 'react-router';
import { blockSpan } from '@product-lab/shared/dates';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtDate, fmtDuration, plural } from '../../lib/format.js';
import { useList } from '../../lib/queries.js';
import { GoalRow, goalSource } from '../goals/GoalParts.jsx';
import { blockColor, categoryLabel, daysLabel } from '../plan/schedule.js';

const GOALS = 4;
const SESSIONS = 3;
const link = 'relative inline-block text-ink underline-offset-2 hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3';

function Part({ title, meta, query, children }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h3>
        {meta && <span className="truncate text-xs text-muted">{meta}</span>}
      </div>
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.error ? (
        <ErrorState compact error={query.error} onRetry={query.refetch} />
      ) : (
        <div className={`transition-opacity duration-200 ${query.isFetching ? 'opacity-60' : ''}`}>{children}</div>
      )}
    </div>
  );
}

export function ProductGoals({ productId, className = '' }) {
  const range = useDateRange();
  const goals = useList('goals');
  const sessions = useList('focus-sessions', { productId, from: range.range.from, to: range.range.to, limit: 500 });
  const blocks = useList('time-blocks');

  const linked = (goals.data?.items ?? []).filter((g) => g.productIds.includes(productId));
  const recent = (sessions.data?.items ?? []).filter((s) => s.status !== 'cancelled');
  const logged = recent.filter((s) => s.status === 'completed');
  const minutes = logged.reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const scheduled = (blocks.data?.items ?? []).filter((b) => b.productId === productId);
  const weekly = scheduled.filter((b) => b.enabled).reduce((sum, b) => sum + blockSpan(b).minutes * b.days.length, 0);
  const empty = goals.isSuccess && sessions.isSuccess && blocks.isSuccess && !linked.length && !recent.length && !scheduled.length;

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
          <Part title="Goals" meta={linked.length > GOALS ? `${GOALS} of ${linked.length}` : null} query={goals}>
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

          <Part title="Focus" meta={range.label} query={sessions}>
            {recent.length ? (
              <>
                <p className="text-[22px] leading-none font-semibold tracking-[-0.02em] text-ink">{fmtDuration(minutes)}</p>
                <p className="mt-1.5 text-xs text-muted">{plural(logged.length, 'session')} logged</p>
                <ul className="mt-2 divide-y divide-hairline-soft">
                  {recent.slice(0, SESSIONS).map((s) => (
                    <li key={s._id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-ink">{s.label || categoryLabel(s.category)}</p>
                        <p className="truncate text-xs text-muted">
                          {[fmtDate(s.startedAt, { weekday: true }), s.experimentName || s.goalTitle].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <span className="shrink-0 text-[13px] font-medium text-ink tabular-nums">{s.status === 'running' ? 'Running' : fmtDuration(s.minutes)}</span>
                    </li>
                  ))}
                </ul>
                {minutes > 0 && <p className="mt-2 text-xs text-muted">Shown side by side — correlation, not cause.</p>}
              </>
            ) : (
              <p className="text-[13px] text-muted">No focus logged in this period.</p>
            )}
          </Part>

          <Part title="Time blocks" meta={weekly ? `${fmtDuration(weekly)} a week` : null} query={blocks}>
            {scheduled.length ? (
              <ul className="divide-y divide-hairline-soft">
                {scheduled.map((b) => (
                  <li key={b._id} className={`flex items-center gap-3 py-2 ${b.enabled ? '' : 'opacity-60'}`}>
                    <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: blockColor(b.category) }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-ink">{b.name}</p>
                      <p className="truncate text-xs text-muted">
                        {categoryLabel(b.category)} · {daysLabel(b.days)}
                        {!b.enabled && ' · Off'}
                      </p>
                    </div>
                    <span className="shrink-0 text-[13px] text-body tabular-nums">
                      {b.start}–{b.end}
                    </span>
                  </li>
                ))}
              </ul>
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
