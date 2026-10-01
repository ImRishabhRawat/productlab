import { useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import { BLOCK_CATEGORIES, PRODUCTIVITY_LABELS, WEEKDAYS } from '@product-lab/shared/constants';
import { TIME_RE, blockSpan } from '@product-lab/shared/dates';
import { beforeEndError, timeBlockSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { Field, FormField, Switch } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { choices, fmtDuration } from '../../lib/format.js';
import { numberOrNull, str, useForm } from '../../lib/form.js';
import { useGet, useList, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { DAY_PRESETS, dayLabel, overlapping, remindersOff, sortDays } from './schedule.js';

const CATEGORY_OPTIONS = choices(BLOCK_CATEGORIES, PRODUCTIVITY_LABELS.blockCategory);
const DEFAULT_REMINDERS = { beforeStart: 5, atStart: true, beforeEnd: null };

const minuteOptions = (values, current) =>
  [...new Set([...values, ...(current ? [Number(current)] : [])])]
    .sort((a, b) => a - b)
    .map((m) => ({ value: String(m), label: `${m} min` }));

function initialValues(block, days) {
  const r = block?.reminders ?? DEFAULT_REMINDERS;
  return {
    name: block?.name ?? '',
    start: block?.start ?? '',
    end: block?.end ?? '',
    days: sortDays(block?.days ?? days ?? WEEKDAYS),
    category: block?.category ?? 'business',
    goalId: block?.goalId ?? '',
    productId: block?.productId ?? '',
    enabled: block?.enabled ?? true,
    reminders: { beforeStart: str(r.beforeStart), atStart: Boolean(r.atStart), beforeEnd: str(r.beforeEnd) },
  };
}

function TimeBlockDialog({ onClose, block, days, blocks = [] }) {
  const toast = useToast();
  const timezone = useSettings().data?.timezone;
  const atStartId = useId();
  const form = useForm(() => initialValues(block, days));
  const goals = useList('goals');
  const products = useList('products', { sort: 'name' });
  const prefs = useGet('/notification-preferences');
  const save = useMutate((body) =>
    block ? api(`/time-blocks/${block._id}`, { method: 'PATCH', body }) : api('/time-blocks', { method: 'POST', body }),
  );

  const v = form.values;
  const timed = TIME_RE.test(v.start) && TIME_RE.test(v.end) && v.start !== v.end;
  const span = timed ? blockSpan(v) : null;
  const clashes = timed && v.enabled && v.days.length ? overlapping(v, blocks.filter((b) => b.enabled && b._id !== block?._id)) : [];
  const goalOptions = (goals.data?.items ?? [])
    .filter((g) => g.status === 'active' || g._id === v.goalId)
    .map((g) => ({ value: g._id, label: g.title }));
  const productOptions = (products.data?.items ?? [])
    .filter((p) => p.status !== 'killed' || p._id === v.productId)
    .map((p) => ({ value: p._id, label: p.name }));
  const toggleDay = (d) => form.set('days', sortDays(v.days.includes(d) ? v.days.filter((x) => x !== d) : [...v.days, d]));
  const silenced = remindersOff(prefs.data).map((r) => r.key);
  const offHint = (key) => (v.reminders[key] && silenced.includes(key) ? 'Off in Notification settings' : undefined);
  const endMinutes = [5, 10, 15].filter((m) => !span || !beforeEndError({ ...v, reminders: { beforeEnd: m } }));

  async function submit() {
    const valid = form.validate(timeBlockSchema, {
      name: v.name,
      start: v.start || undefined,
      end: v.end || undefined,
      days: v.days,
      category: v.category,
      goalId: v.goalId || null,
      productId: v.productId || null,
      enabled: v.enabled,
      reminders: {
        beforeStart: numberOrNull(v.reminders.beforeStart),
        atStart: v.reminders.atStart,
        beforeEnd: numberOrNull(v.reminders.beforeEnd),
      },
    });
    if (!valid) return;
    try {
      await save.mutateAsync(valid);
      toast.success(block ? 'Block updated' : 'Block added');
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
      title={block ? 'Edit block' : 'Add block'}
      description={`${block ? 'Changes apply from today; past days keep their schedule.' : 'Repeats every week on the days you pick.'} Times are in ${timezone}.`}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {block ? 'Save changes' : 'Add block'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <FormField form={form} name="name" label="Name" required placeholder="Money Block" autoFocus className="col-span-2" />
          <FormField form={form} name="start" label="Start" type="time" required />
          <FormField
            form={form}
            name="end"
            label="End"
            type="time"
            required
            hint={span && `${span.to > 1440 ? 'Ends next day · ' : ''}${fmtDuration(span.minutes)}`}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-body">
            Days<span className="text-negative"> *</span>
          </legend>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={v.days.includes(d)}
                onClick={() => toggleDay(d)}
                className={`h-10 min-w-0 rounded-md border text-[13px] font-medium transition-colors md:h-9 ${
                  v.days.includes(d) ? 'border-dark bg-dark text-canvas' : 'border-hairline bg-canvas text-body hover:bg-tint'
                }`}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {DAY_PRESETS.map((p) => (
              <Button key={p.label} size="sm" variant="ghost" onClick={() => form.set('days', p.days)}>
                {p.label}
              </Button>
            ))}
          </div>
          {form.errors.days && (
            <p className="mt-1 text-xs text-negative" role="alert">
              {form.errors.days}
            </p>
          )}
        </fieldset>

        {clashes.length > 0 && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-warn/15 px-3 py-2 text-[13px] text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Overlaps {clashes.map((b) => b.name).join(', ')} on a shared day. You can still save it.
            </span>
          </p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField form={form} name="category" label="Category" as="select" options={CATEGORY_OPTIONS} />
          <FormField
            form={form}
            name="goalId"
            label="Goal"
            as="select"
            placeholder="No goal"
            options={goalOptions}
            hint={goals.error ? 'Couldn’t load goals' : undefined}
          />
          <FormField
            form={form}
            name="productId"
            label="Product"
            as="select"
            placeholder="No product"
            options={productOptions}
            hint={products.error ? 'Couldn’t load products' : undefined}
          />
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-body">Reminders</legend>
          <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3">
            <FormField
              form={form}
              name="reminders.beforeStart"
              label="Before start"
              as="select"
              placeholder="Off"
              options={minuteOptions([5, 10, 15, 30], v.reminders.beforeStart)}
              hint={offHint('beforeStart')}
            />
            <Field label="At start" htmlFor={atStartId} hint={offHint('atStart')}>
              <Switch id={atStartId} checked={v.reminders.atStart} onChange={(on) => form.set('reminders.atStart', on)} />
            </Field>
            <FormField
              form={form}
              name="reminders.beforeEnd"
              label="Before end"
              as="select"
              placeholder="Off"
              options={minuteOptions(endMinutes, v.reminders.beforeEnd)}
              hint={offHint('beforeEnd')}
            />
          </div>
        </fieldset>

        <div className="border-t border-hairline-soft pt-3">
          <Switch checked={v.enabled} onChange={(on) => form.set('enabled', on)}>
            Enabled <span className="text-muted">· shows on Today and sends reminders</span>
          </Switch>
        </div>
      </div>
    </Modal>
  );
}

export function TimeBlockFormModal({ open, ...props }) {
  return open ? <TimeBlockDialog {...props} /> : null;
}
