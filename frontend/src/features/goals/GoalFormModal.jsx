import { useId } from 'react';
import { GOAL_CATEGORIES, GOAL_LEVELS, GOAL_PRODUCT_TRACKING, GOAL_STATUSES, GOAL_TRACKING, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { addDays, addMonths } from '@product-lab/shared/dates';
import { goalSchema } from '@product-lab/shared/schemas';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { choices, currencySymbol } from '../../lib/format.js';
import { numberOrNull, str, useForm } from '../../lib/form.js';
import { useList, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { MONEY_TRACKING, TRACKING_TITLES } from './GoalParts.jsx';

const { goalLevel, goalCategory, goalStatus } = PRODUCTIVITY_LABELS;
const LEVEL_OPTIONS = choices(GOAL_LEVELS, goalLevel);
const CATEGORY_OPTIONS = choices(GOAL_CATEGORIES, goalCategory);
const STATUS_OPTIONS = choices(GOAL_STATUSES, goalStatus);
const HINTS = {
  manual: 'You enter the current value',
  revenue: 'Recorded revenue of linked products',
  contribution: 'Revenue after ad spend and costs',
  purchases: 'Purchases of linked products',
  focus_hours: 'Focus sessions logged on this goal',
};
const FIXED_UNITS = { purchases: 'purchases', focus_hours: 'hours' };
const UNIT_SUGGESTIONS = ['kg', 'km', 'books', 'hours', 'sessions', 'courses'];

function periodFor(level, today) {
  if (level === 'monthly') return { startDate: `${today.slice(0, 8)}01`, targetDate: addDays(addMonths(today, 1), -1) };
  if (level === 'yearly') return { startDate: `${today.slice(0, 4)}-01-01`, targetDate: `${today.slice(0, 4)}-12-31` };
  return { startDate: today, targetDate: '' };
}

function initialValues(goal, today) {
  const g = goal ?? { level: 'monthly', tracking: 'manual', status: 'active', ...periodFor('monthly', today) };
  return {
    title: g.title ?? '',
    description: g.description ?? '',
    level: g.level,
    category: g.category ?? '',
    tracking: g.tracking ?? 'manual',
    targetValue: str(g.targetValue),
    currentValue: str(g.currentValue),
    unit: g.unit ?? '',
    startDate: g.startDate ?? '',
    targetDate: g.targetDate ?? '',
    status: g.status,
    notes: g.notes ?? '',
    productIds: (g.productIds ?? []).map(String),
  };
}

function TrackingPicker({ value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-body">Tracking</legend>
      <div role="radiogroup" aria-label="Tracking" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {GOAL_TRACKING.map((t) => {
          const selected = value === t;
          return (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(t)}
              className={`flex min-h-14 flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors ${
                selected ? 'border-ink bg-canvas ring-1 ring-ink' : 'border-hairline bg-canvas hover:bg-tint/60'
              }`}
            >
              <span className="text-[13px] font-medium text-ink">{TRACKING_TITLES[t]}</span>
              <span className="text-[11px] leading-snug text-muted">{HINTS[t]}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ProductChecklist({ form, required }) {
  const products = useList('products', { sort: 'name' });
  const items = products.data?.items ?? [];
  const selected = form.values.productIds;
  const error = form.errors.productIds;
  const toggle = (id) => form.set('productIds', selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-medium text-body">
        Linked products
        {required && <span className="text-negative"> *</span>}
        {selected.length > 0 && <span className="font-normal text-muted"> · {selected.length} selected</span>}
      </legend>
      {products.isPending ? (
        <Skeleton className="h-28" />
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={products.refetch} compact />
      ) : !items.length ? (
        <p className="text-[13px] text-muted">No products yet. Create one on the Products page to link it here.</p>
      ) : (
        <ul
          tabIndex={-1}
          aria-label="Linked products"
          aria-invalid={Boolean(error) || undefined}
          className={`max-h-56 divide-y divide-hairline-soft overflow-y-auto rounded-md border ${error ? 'border-negative' : 'border-hairline'}`}
        >
          {items.map((p) => (
            <li key={p._id}>
              <label className="flex min-h-10 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-tint/50">
                <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={selected.includes(p._id)} onChange={() => toggle(p._id)} />
                <span className={`min-w-0 flex-1 truncate text-[13px] ${p.status === 'killed' ? 'text-muted' : 'text-ink'}`}>{p.name}</span>
                {p.status === 'killed' && <StatusBadge value="killed" />}
              </label>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="mt-1 text-xs text-negative" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">
          {required ? 'Their recorded results in the goal period count toward it.' : 'Optional. Shows their results next to this goal.'}
        </p>
      )}
    </fieldset>
  );
}

function GoalDialog({ onClose, goal, onSaved }) {
  const { today } = useDateRange();
  const toast = useToast();
  const listId = useId();
  const currency = useSettings().data?.currency;
  const form = useForm(() => initialValues(goal, today));
  const save = useMutate((body) => (goal ? api(`/goals/${goal._id}`, { method: 'PATCH', body }) : api('/goals', { method: 'POST', body })));
  const v = form.values;
  const manual = v.tracking === 'manual';
  const money = MONEY_TRACKING.includes(v.tracking) || (manual && v.unit.trim() === currency);
  const numeric = { type: 'number', step: 'any', inputMode: 'decimal', prefix: money ? currencySymbol() : undefined };

  const setLevel = (level) => form.setValues((x) => ({ ...x, level, ...(!goal && periodFor(level, today)) }));
  const setTracking = (tracking) => {
    form.set('tracking', tracking);
    if (!GOAL_PRODUCT_TRACKING.includes(tracking)) form.setErrors((e) => ({ ...e, productIds: undefined }));
  };

  async function submit() {
    const body = {
      title: v.title,
      description: v.description,
      level: v.level,
      category: v.category || undefined,
      tracking: v.tracking,
      targetValue: numberOrNull(v.targetValue),
      ...(manual && { currentValue: numberOrNull(v.currentValue) }),
      unit: MONEY_TRACKING.includes(v.tracking) ? currency : (FIXED_UNITS[v.tracking] ?? v.unit),
      startDate: v.startDate || null,
      targetDate: v.targetDate || null,
      status: v.status,
      notes: v.notes,
      productIds: v.productIds,
    };
    const valid = form.validate(goalSchema, body);
    if (!valid) return;
    try {
      const saved = await save.mutateAsync(valid);
      toast.success(goal ? 'Goal updated' : 'Goal created');
      onClose();
      onSaved?.(saved);
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  const dates = (
    <>
      <FormField form={form} name="startDate" label="Start date" type="date" hint={manual ? undefined : 'Results count from this date'} />
      <FormField form={form} name="targetDate" label="Target date" type="date" min={v.startDate || undefined} />
    </>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={goal ? 'Edit goal' : 'New goal'}
      description="A clear target, and the work that moves it."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {goal ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormField form={form} name="title" label="Title" required autoFocus placeholder="Build personal savings" />
        <FormField form={form} name="description" label="Description" as="textarea" rows={2} placeholder="Why it matters, in one line" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField form={form} name="level" label="Level" as="select" options={LEVEL_OPTIONS} onChange={(e) => setLevel(e.target.value)} />
          <FormField form={form} name="category" label="Category" as="select" required placeholder="Choose a category" options={CATEGORY_OPTIONS} />
          <FormField form={form} name="status" label="Status" as="select" options={STATUS_OPTIONS} />
        </div>

        <TrackingPicker value={v.tracking} onChange={setTracking} />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField
            form={form}
            name="targetValue"
            label="Target"
            min="0"
            placeholder="None"
            hint={v.tracking === 'purchases' ? 'Number of purchases' : v.tracking === 'focus_hours' ? 'Hours of focus' : undefined}
            {...numeric}
          />
          {manual ? (
            <>
              <FormField form={form} name="unit" label="Unit" list={listId} placeholder={`e.g. ${currency}, kg, books`} />
              <FormField form={form} name="currentValue" label="Current value" placeholder="Not set" {...numeric} />
            </>
          ) : (
            dates
          )}
        </div>
        <datalist id={listId}>
          {[currency, ...UNIT_SUGGESTIONS].map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
        {manual && <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{dates}</div>}

        <ProductChecklist form={form} required={GOAL_PRODUCT_TRACKING.includes(v.tracking)} />
        <FormField form={form} name="notes" label="Notes" as="textarea" rows={3} placeholder="Plan, milestones, what done looks like" />
      </div>
    </Modal>
  );
}

export function GoalFormModal({ open, ...props }) {
  return open ? <GoalDialog {...props} /> : null;
}
