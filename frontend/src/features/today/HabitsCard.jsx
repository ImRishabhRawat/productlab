import { Plus, Repeat } from 'lucide-react';
import { PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { addDays, bucketStart, weekdayOf } from '@product-lab/shared/dates';
import { DayStrip } from '../../components/charts/CalendarHeatmap.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, Skeleton } from '../../components/ui/States.jsx';
import { api } from '../../lib/api.js';
import { useGet } from '../../lib/queries.js';
import { CheckToggle } from './CheckToggle.jsx';
import { useTodayMutation } from './useTodaySummary.js';

const doneLabel = (v) => (v ? 'Done' : 'Not done');
const stripLabel = (name, strip) => {
  const days = strip.filter((s) => s.value).map((s) => PRODUCTIVITY_LABELS.weekday[weekdayOf(s.date)]);
  return `${name}, last 7 days: ${days.length ? `done ${days.join(', ')}` : 'not done yet'}`;
};

export function HabitsCard({ habits, date, className = '', cardRef }) {
  const from = addDays(date, -6);
  const history = useGet('/habits/completions', { from, to: date });
  const toggle = useTodayMutation(
    ({ id, done }) => api(`/habits/${id}/completions/${date}`, { method: done ? 'PUT' : 'DELETE' }),
    (d, { id, done }) => ({ ...d, habits: d.habits.map((h) => (h._id === id ? { ...h, done } : h)) }),
  );
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const weekStart = bucketStart(date, 'week');
  const logged = new Set((history.data?.items ?? []).map((c) => `${c.habitId}|${c.date}`));

  return (
    <Card ref={cardRef} className={`scroll-mt-20 p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Habits"
        subtitle={habits.length ? `${habits.filter((h) => h.done).length} of ${habits.length} done today` : null}
        actions={
          habits.length > 0 && (
            <ButtonLink to="/plan#habits" size="sm" variant="ghost">
              Manage
            </ButtonLink>
          )
        }
      />
      {!habits.length ? (
        <EmptyState
          compact
          icon={Repeat}
          title="No habits yet."
          description="Track a few small daily habits next to your work."
          action={
            <ButtonLink to="/plan#habits" size="sm" icon={Plus}>
              Add habits
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-2 divide-y divide-hairline-soft">
          {habits.map((h) => {
            const strip = days.map((d) => ({ date: d, value: (d === date ? h.done : logged.has(`${h._id}|${d}`)) ? 1 : 0 }));
            const week = strip.filter((s) => s.value && s.date >= weekStart).length;
            return (
              <li key={h._id} className="flex items-center gap-3 py-2.5">
                <CheckToggle done={h.done} onToggle={() => toggle.mutate({ id: h._id, done: !h.done })} label={`${h.name} done today`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-medium text-ink">{h.name}</p>
                    <p className={`shrink-0 text-xs tabular-nums ${week >= h.targetPerWeek ? 'font-medium text-positive' : 'text-muted'}`}>
                      {week}/{h.targetPerWeek} this week
                    </p>
                  </div>
                  <div className="mt-1.5 min-h-[18px]">
                    {history.isPending ? (
                      <Skeleton className="h-[18px] w-[138px]" />
                    ) : (
                      !history.error && <DayStrip days={strip} label={stripLabel(h.name, strip)} today={date} format={doneLabel} />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {history.error && habits.length > 0 && (
        <p className="mt-2 text-xs text-muted" role="alert">
          Couldn&apos;t load the last 7 days.{' '}
          <button type="button" onClick={() => history.refetch()} className="font-medium text-ink underline">
            Retry
          </button>
        </p>
      )}
    </Card>
  );
}
