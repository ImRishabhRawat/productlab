import { useState } from 'react';
import { Plus, Repeat } from 'lucide-react';
import { PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { addDays, bucketStart, weekdayOf } from '@product-lab/shared/dates';
import { dayProgress } from '@product-lab/shared/metrics';
import { DayStrip } from '../../components/charts/CalendarHeatmap.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { api } from '../../lib/api.js';
import { useGet } from '../../lib/queries.js';
import { CheckToggle } from './CheckToggle.jsx';
import { useTodayMutation } from './useTodaySummary.js';

const doneLabel = (v) => (v ? 'Done' : 'Not done');
const stripLabel = (name, week, strip) => {
  const days = strip.filter((s) => s.value).map((s) => PRODUCTIVITY_LABELS.weekday[weekdayOf(s.date)]);
  return `${name}, ${week}: ${days.length ? `done ${days.join(', ')}` : 'not done yet'}`;
};
const check = ({ id, day, done }) => api(`/habits/${id}/completions/${day}`, { method: done ? 'PUT' : 'DELETE' });

export function HabitsCard({ habits, date, progress, lateNight, className = '', cardRef }) {
  const [picked, setPicked] = useState(null);
  const yesterday = addDays(date, -1);
  const day = lateNight && picked === yesterday ? yesterday : date;
  const isToday = day === date;
  const weekStart = bucketStart(day, 'week');
  const week = weekStart === bucketStart(date, 'week') ? 'this week' : 'last week';
  const params = { from: weekStart, to: date };
  const history = useGet('/habits/completions', params, { placeholderData: undefined });
  const checkToday = useTodayMutation(check, (d, { id, done, due }) => {
    const step = done ? 1 : -1;
    const { habitsDone, habitsTotal } = d.progress;
    const counts = { ...d.progress, habitsDone: habitsDone + step, habitsTotal: habitsTotal + (due ? 0 : step) };
    return {
      ...d,
      habits: d.habits.map((h) => (h._id === id ? { ...h, done } : h)),
      progress: { ...counts, score: dayProgress({ ...counts, blocksDue: counts.blocksTotal }) },
    };
  });
  const checkPast = useTodayMutation(
    check,
    (d, { id, day: on, done }) => ({ items: done ? [...d.items, { habitId: id, date: on }] : d.items.filter((c) => c.habitId !== id || c.date !== on) }),
    ['get', '/habits/completions', params],
  );
  const toggle = isToday ? checkToday : checkPast;
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d) => d <= date);
  const logged = new Set((history.data?.items ?? []).map((c) => `${c.habitId}|${c.date}`));
  const doneOn = (h, d) => (d === date ? h.done : logged.has(`${h._id}|${d}`));
  const subtitle = isToday
    ? progress.habitsTotal
      ? `${progress.habitsDone} of ${progress.habitsTotal} done today`
      : 'Weekly targets met'
    : history.data && `${habits.filter((h) => doneOn(h, day)).length} done yesterday`;

  return (
    <Card ref={cardRef} className={`scroll-mt-20 p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Habits"
        subtitle={habits.length ? subtitle : null}
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
        <>
          {lateNight && (
            <div className="mt-3">
              <SegmentedControl
                label="Day to check off"
                size="sm"
                value={day}
                onChange={setPicked}
                options={[
                  { value: yesterday, label: 'Yesterday' },
                  { value: date, label: 'Today' },
                ]}
              />
            </div>
          )}
          <ul className="mt-2 divide-y divide-hairline-soft">
            {habits.map((h) => {
              const strip = days.map((d) => ({ date: d, value: doneOn(h, d) ? 1 : 0 }));
              const count = strip.filter((s) => s.value).length;
              const done = doneOn(h, day);
              return (
                <li key={h._id} className="flex items-center gap-3 py-2.5">
                  {isToday || history.data ? (
                    <CheckToggle
                      done={done}
                      onToggle={() => toggle.mutate({ id: h._id, day, done: !done, due: count - (done ? 1 : 0) < h.targetPerWeek })}
                      label={`${h.name} done ${isToday ? 'today' : 'yesterday'}`}
                    />
                  ) : (
                    <Skeleton className="size-10 shrink-0 rounded-full" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink">{h.name}</p>
                      <p className={`shrink-0 text-xs tabular-nums ${count >= h.targetPerWeek ? 'font-medium text-positive' : 'text-muted'}`}>
                        {count}/{h.targetPerWeek} {week}
                      </p>
                    </div>
                    <div className="mt-1.5 min-h-[18px]">
                      {history.isPending ? (
                        <Skeleton className="h-[18px] w-[138px]" />
                      ) : (
                        !history.error && <DayStrip days={strip} label={stripLabel(h.name, week, strip)} today={day} format={doneLabel} />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {history.error && habits.length > 0 && (
        <p className="mt-2 text-xs text-muted" role="alert">
          Couldn&apos;t load this week&apos;s check-ins.{' '}
          <button type="button" onClick={() => history.refetch()} className="font-medium text-ink underline">
            Retry
          </button>
        </p>
      )}
    </Card>
  );
}
