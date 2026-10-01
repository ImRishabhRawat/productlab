import { useState } from 'react';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronRight, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { addDays, bucketStart, daysBetween, isoDateIn, weekdayOf } from '@product-lab/shared/dates';
import { habitTarget } from '@product-lab/shared/metrics';
import { habitSchema } from '@product-lab/shared/schemas';
import { DayStrip } from '../../components/charts/CalendarHeatmap.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtDate } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { useGet, useList, useMutate, useRemove, useUpdate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { dayLabel } from './schedule.js';

const CELL = 14;
const targetLabel = (n) => (n === 7 ? 'Every day' : `${n}× a week`);
const TARGETS = [7, 6, 5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: targetLabel(n) }));
const weekTarget = (habit, week, from) => habitTarget(habit.targetPerWeek, daysBetween(from > week ? from : week, addDays(week, 6)) + 1);

function HabitDialog({ onClose, habit }) {
  const toast = useToast();
  const form = useForm(() => ({ name: habit?.name ?? '', targetPerWeek: String(habit?.targetPerWeek ?? 7) }));
  const save = useMutate((body) =>
    habit ? api(`/habits/${habit._id}`, { method: 'PATCH', body }) : api('/habits', { method: 'POST', body }),
  );

  async function submit() {
    const valid = form.validate(habitSchema, { name: form.values.name, targetPerWeek: Number(form.values.targetPerWeek) });
    if (!valid) return;
    try {
      await save.mutateAsync(valid);
      toast.success(habit ? 'Habit updated' : 'Habit added');
      onClose();
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={habit ? 'Edit habit' : 'Add habit'}
      description="Tick it off on Today. The target is per week, so a missed day is fine."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {habit ? 'Save changes' : 'Add habit'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField form={form} name="name" label="Name" required placeholder="Walk" autoFocus />
        <FormField form={form} name="targetPerWeek" label="Target" as="select" options={TARGETS} />
      </div>
    </Modal>
  );
}

export function HabitFormModal({ open, ...props }) {
  return open ? <HabitDialog {...props} /> : null;
}

function weeksOf(from, today, done) {
  const weeks = [];
  for (let start = bucketStart(from, 'week'); start <= today; start = addDays(start, 7)) {
    const days = [];
    for (let d = start < from ? from : start; d <= today && d <= addDays(start, 6); d = addDays(d, 1)) {
      days.push({ date: d, value: done.has(d) ? 1 : 0 });
    }
    weeks.push({ start, days });
  }
  return weeks;
}

function Consistency({ habit, from, today, done }) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5" style={{ width: 7 * (CELL + 2) }}>
      {weeksOf(from, today, done).map(({ start, days }) => {
        const count = days.filter((d) => d.value).length;
        const target = weekTarget(habit, start, from);
        return (
          <div key={start} style={{ marginLeft: ((weekdayOf(days[0].date) + 6) % 7) * (CELL + 2) }}>
            <DayStrip
              days={days}
              cell={CELL}
              today={today}
              format={(v) => (v ? 'Done' : 'Not done')}
              label={`${habit.name}, week of ${fmtDate(start)}: ${count} of ${target}${count >= target ? ', target met' : ''}`}
            />
          </div>
        );
      })}
    </div>
  );
}

function HabitRow({ habit, done, from, weekStart, today, first, last, busy, onMove, onEdit, onArchive, onDelete }) {
  const count = [...done].filter((d) => d >= weekStart && d <= today).length;
  const target = weekTarget(habit, weekStart, from);
  const met = count >= target;
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
      <div className="min-w-0 flex-1 basis-40">
        <p className="truncate text-sm font-medium text-ink">{habit.name}</p>
        <p className="text-xs text-muted">Target: {targetLabel(target).toLowerCase()}</p>
      </div>
      <div className="flex shrink-0 gap-0.5 sm:order-1">
        <IconButton icon={ArrowUp} label={`Move ${habit.name} up`} disabled={first || busy} onClick={() => onMove(-1)} />
        <IconButton
          icon={ArrowDown}
          label={`Move ${habit.name} down`}
          disabled={last || busy}
          onClick={() => onMove(1)}
        />
      </div>
      <div className="w-full sm:w-48">
        <Meter
          value={count}
          max={target}
          tone={met ? 'good' : 'default'}
          height={6}
          label={target < habit.targetPerWeek ? `This week · from ${dayLabel(weekdayOf(from))}` : 'This week'}
          valueLabel={`${count} of ${target}${met ? ' · target met' : ''}`}
        />
      </div>
      <Consistency habit={habit} from={from} today={today} done={done} />
      <div className="ml-auto flex shrink-0 gap-0.5 sm:order-2 sm:ml-0">
        <IconButton icon={Pencil} label={`Edit ${habit.name}`} onClick={onEdit} />
        <IconButton icon={Archive} label={`Archive ${habit.name}`} onClick={onArchive} />
        <IconButton icon={Trash2} label={`Delete ${habit.name}`} onClick={onDelete} />
      </div>
    </li>
  );
}

export function HabitsSection() {
  const { today } = useDateRange();
  const timezone = useSettings().data?.timezone;
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const weekStart = bucketStart(today, 'week');
  const windowStart = addDays(weekStart, -21);
  const habits = useList('habits', { all: true });
  const completions = useGet('/habits/completions', { from: windowStart, to: today });
  const update = useUpdate('habits');
  const remove = useRemove('habits');
  const reorder = useMutate((list) =>
    Promise.all(list.map((h, order) => h.order !== order && api(`/habits/${h._id}`, { method: 'PATCH', body: { order } }))),
  );

  const all = habits.data?.items ?? [];
  const active = all.filter((h) => !h.archived);
  const archived = all.filter((h) => h.archived);
  const doneBy = new Map(all.map((h) => [h._id, new Set()]));
  for (const c of completions.data?.items ?? []) doneBy.get(c.habitId)?.add(c.date);
  const error = habits.error ?? completions.error;
  const close = () => setDialog(null);

  function fromFor(habit) {
    const firstDone = [...doneBy.get(habit._id)].sort()[0];
    const created = isoDateIn(habit.createdAt, timezone);
    const earliest = firstDone && firstDone < created ? firstDone : created;
    const from = earliest > windowStart ? earliest : windowStart;
    return from > today ? today : from;
  }

  async function move(index, delta) {
    const next = [...active];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    try {
      await reorder.mutateAsync(next);
    } catch (err) {
      toast.error(err);
    }
  }

  async function setArchived(habit, value) {
    try {
      await update.mutateAsync({ id: habit._id, archived: value });
      toast.success(`${habit.name} ${value ? 'archived' : 'restored'}`);
    } catch (err) {
      toast.error(err);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(dialog.habit._id);
      toast.success('Habit deleted');
    } catch (err) {
      toast.error(err);
    }
    close();
  }

  const addButton = (
    <Button size="sm" icon={Plus} onClick={() => setDialog({ kind: 'edit' })}>
      Add habit
    </Button>
  );

  return (
    <>
      <Section
        id="habits"
        title="Habits"
        description="This week against the target, and the last 4 weeks"
        actions={habits.isSuccess && !all.length ? null : addButton}
      >
        {error ? (
          <Card>
            <ErrorState
              compact
              error={error}
              onRetry={() => {
                habits.refetch();
                completions.refetch();
              }}
            />
          </Card>
        ) : habits.isPending || completions.isPending ? (
          <Skeleton className="h-36" />
        ) : !all.length ? (
          <Card>
            <EmptyState
              compact
              icon={ListChecks}
              title="No habits yet."
              description="Add the few you want to keep, like a walk or reading."
              action={addButton}
            />
          </Card>
        ) : (
          <>
            {active.length ? (
              <Card>
                <ul className="divide-y divide-hairline-soft">
                  {active.map((h, i) => (
                    <HabitRow
                      key={h._id}
                      habit={h}
                      done={doneBy.get(h._id)}
                      from={fromFor(h)}
                      weekStart={weekStart}
                      today={today}
                      first={i === 0}
                      last={i === active.length - 1}
                      busy={reorder.isPending || habits.isFetching}
                      onMove={(delta) => move(i, delta)}
                      onEdit={() => setDialog({ kind: 'edit', habit: h })}
                      onArchive={() => setArchived(h, true)}
                      onDelete={() => setDialog({ kind: 'delete', habit: h })}
                    />
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-[13px] text-muted">No active habits. Restore one below or add a new one.</p>
            )}
            {archived.length > 0 && (
              <details className="group mt-3">
                <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink md:min-h-8 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
                  Archived · {archived.length}
                </summary>
                <Card className="mt-1">
                  <ul className="divide-y divide-hairline-soft">
                    {archived.map((h) => (
                      <li key={h._id} className="flex items-center gap-3 px-4 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-body">{h.name}</p>
                          <p className="text-xs text-muted">Target: {targetLabel(h.targetPerWeek).toLowerCase()}</p>
                        </div>
                        <IconButton
                          icon={ArchiveRestore}
                          label={`Restore ${h.name}`}
                          onClick={() => setArchived(h, false)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Delete ${h.name}`}
                          onClick={() => setDialog({ kind: 'delete', habit: h })}
                        />
                      </li>
                    ))}
                  </ul>
                </Card>
              </details>
            )}
          </>
        )}
      </Section>
      <HabitFormModal open={dialog?.kind === 'edit'} habit={dialog?.habit} onClose={close} />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onClose={close}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        title="Delete habit?"
        message={`“${dialog?.habit?.name}” and all its check-offs are deleted for good. Archive it instead to keep the history.`}
        confirmLabel="Delete habit"
      />
    </>
  );
}
