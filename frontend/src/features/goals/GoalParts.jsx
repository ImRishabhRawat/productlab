import { useState } from 'react';
import { Link } from 'react-router';
import { CircleCheck, CirclePause, CircleX, Clock, Pencil, TriangleAlert, X } from 'lucide-react';
import { GOAL_PRODUCT_TRACKING } from '@product-lab/shared/constants';
import { isoDateIn } from '@product-lab/shared/dates';
import { goalUpdateSchema } from '@product-lab/shared/schemas';
import { Meter } from '../../components/charts/Meter.jsx';
import { MUTED, SERIES, STATUS } from '../../components/charts/palette.js';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { DASH, currencySymbol, fmtCurrency, fmtDate, fmtNumber, fmtPercent, plural } from '../../lib/format.js';
import { numberOrNull, str, useForm } from '../../lib/form.js';
import { useUpdate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';

export const MONEY_TRACKING = ['revenue', 'contribution'];
export const TRACKING_TITLES = { manual: 'Manual', revenue: 'Revenue', contribution: 'Contribution', purchases: 'Purchases', focus_hours: 'Focus hours' };
export const TONE_COLORS = { default: SERIES[0], good: STATUS.good, warning: STATUS.warning, muted: MUTED };
const DONE = { active: 'Goal reactivated', achieved: 'Marked as achieved', paused: 'Goal paused', dropped: 'Goal dropped' };
const SINGULAR = { purchases: 'purchase', hours: 'hour' };

export const isMoneyGoal = (goal, currency) => MONEY_TRACKING.includes(goal.tracking) || (Boolean(goal.unit) && goal.unit === currency);
export const isReached = (goal) => goal.status === 'active' && goal.targetValue > 0 && goal.current >= goal.targetValue;
export const unitLabel = (goal, value) => (value === 1 ? (SINGULAR[goal.unit] ?? goal.unit) : goal.unit);

export function fmtSpan(days) {
  if (days < 60) return plural(days, 'day');
  if (days < 730) return plural(Math.round(days / 30.44), 'month');
  return plural(Math.round(days / 365.25), 'year');
}

export function goalPeriod(goal, today, timezone) {
  const from = goal.startDate ?? isoDateIn(goal.createdAt, timezone);
  return { from, to: goal.targetDate && goal.targetDate < today ? goal.targetDate : today };
}

export function useGoalFormat() {
  const currency = useSettings().data?.currency;
  return (goal, value, { compact = false, unit: withUnit = true } = {}) => {
    if (value == null) return DASH;
    if (isMoneyGoal(goal, currency)) return fmtCurrency(value, { compact });
    const n = fmtNumber(value, { compact, digits: 1 });
    if (!goal.unit || !withUnit) return n;
    const unit = unitLabel(goal, value);
    return `${n}${/^[a-z]/i.test(unit) ? ' ' : ''}${unit}`;
  };
}

export function goalTone(goal) {
  if (goal.status === 'achieved') return 'good';
  if (goal.status !== 'active') return 'muted';
  if (isReached(goal)) return 'good';
  return goal.daysLeft < 0 ? 'warning' : 'default';
}

function timing(goal) {
  if (goal.status === 'achieved') return { icon: CircleCheck, text: `Achieved ${fmtDate(goal.achievedAt ?? goal.updatedAt, { year: true })}`, tone: 'text-positive' };
  if (goal.status === 'paused') return { icon: CirclePause, text: 'Paused' };
  if (goal.status === 'dropped') return { icon: CircleX, text: 'Dropped' };
  if (isReached(goal)) return { icon: CircleCheck, text: 'Target reached', tone: 'text-positive' };
  if (goal.daysLeft == null) return { icon: Clock, text: 'No target date' };
  if (goal.daysLeft < 0) return { icon: TriangleAlert, text: `Overdue by ${fmtSpan(-goal.daysLeft)}`, tone: 'text-warning' };
  return { icon: Clock, text: goal.daysLeft ? `${fmtSpan(goal.daysLeft)} left` : 'Due today' };
}

export function GoalTiming({ goal, className = '' }) {
  const { icon: Icon, text, tone = 'text-muted' } = timing(goal);
  return (
    <span className={`inline-flex items-center gap-1 text-xs whitespace-nowrap ${tone} ${className}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </span>
  );
}

export function goalSource(goal) {
  const products = goal.products ?? [];
  if (GOAL_PRODUCT_TRACKING.includes(goal.tracking)) {
    if (!products.length) return `${TRACKING_TITLES[goal.tracking]} · no linked products yet`;
    return `${TRACKING_TITLES[goal.tracking]} from ${products.length === 1 ? products[0].name : `${products.length} products`}`;
  }
  return goal.tracking === 'focus_hours' ? 'Focus sessions logged on this goal' : 'Updated manually';
}

export function GoalRow({ goal, note }) {
  return (
    <Link to={`/goals/${goal._id}`} className="block rounded-md px-2 py-2 hover:bg-tint/50">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[13px] font-medium text-ink">{goal.title}</span>
        <GoalTiming goal={goal} />
      </span>
      <GoalMeter goal={goal} compact />
      {note && <span className="mt-1 block truncate text-xs text-muted">{note}</span>}
    </Link>
  );
}

export function GoalMeter({ goal, compact = false }) {
  const fmt = useGoalFormat();
  if (!(goal.targetValue > 0)) {
    return (
      <p className="text-[13px] text-body">
        {fmt(goal, goal.current, { compact })} <span className="text-muted">· no target set</span>
      </p>
    );
  }
  const target = fmt(goal, goal.targetValue, { compact });
  return (
    <Meter
      value={goal.current ?? 0}
      max={goal.targetValue}
      tone={goalTone(goal)}
      height={compact ? 6 : 8}
      label={goal.current == null ? `No value yet · target ${target}` : `${fmt(goal, goal.current, { compact, unit: false })} of ${target}`}
      valueLabel={fmtPercent(goal.progress)}
    />
  );
}

export function useGoalStatus() {
  const toast = useToast();
  const update = useUpdate('goals');
  return {
    busy: update.isPending,
    set: (goal, status) =>
      update.mutate({ id: goal._id, status }, { onSuccess: () => toast.success(DONE[status]), onError: (err) => toast.error(err) }),
  };
}

function UpdateForm({ goal, onDone }) {
  const toast = useToast();
  const currency = useSettings().data?.currency;
  const form = useForm(() => ({ currentValue: str(goal.current) }));
  const save = useUpdate('goals');

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(goalUpdateSchema, { currentValue: numberOrNull(form.values.currentValue) });
    if (!body) return;
    try {
      await save.mutateAsync({ id: goal._id, ...body });
      toast.success('Progress updated');
      onDone();
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <form noValidate onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onDone()} className="flex w-full min-w-0 items-start gap-2">
      <FormField
        form={form}
        name="currentValue"
        aria-label={`Current value${goal.unit ? ` in ${goal.unit}` : ''}`}
        type="number"
        step="any"
        inputMode="decimal"
        autoFocus
        prefix={isMoneyGoal(goal, currency) ? currencySymbol() : undefined}
        className="min-w-0 flex-1 sm:max-w-44"
      />
      <Button type="submit" variant="primary" loading={save.isPending}>
        Save
      </Button>
      <IconButton icon={X} label="Cancel" onClick={onDone} />
    </form>
  );
}

export function QuickUpdate({ goal }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <UpdateForm goal={goal} onDone={() => setEditing(false)} />;
  return (
    <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
      Update progress
    </Button>
  );
}
