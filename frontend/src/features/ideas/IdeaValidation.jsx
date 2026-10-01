import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Megaphone, Plus, Store, X } from 'lucide-react';
import { IDEA_SIGNALS, LABELS } from '@product-lab/shared/constants';
import { ideaScores, pctChange } from '@product-lab/shared/metrics';
import { ideaUpdateSchema, validationSchema } from '@product-lab/shared/schemas';
import { BarList } from '../../components/charts/BarList.jsx';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField, ScoreInput } from '../../components/ui/Field.jsx';
import { EmptyState } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { currencySymbol, DASH, fmtCurrency, fmtNumber } from '../../lib/format.js';
import { numberOrNull, useForm } from '../../lib/form.js';
import { useUpdate } from '../../lib/queries.js';

const SIGNAL_HINTS = {
  demand: 'People asking for it: comments, DMs, requests',
  marketplace: 'Sales, reviews and bestseller ranks',
  social: 'Saves, shares and comments on similar posts',
  search: 'Search volume and trends, checked by hand',
};
const NOTE_FIELDS = [
  { name: 'audience', label: 'Audience definition', placeholder: 'Who buys it, and where you can reach them' },
  { name: 'painDesire', label: 'Customer pain or desire', placeholder: 'What they want solved, in their words' },
  { name: 'rightsNotes', label: 'Rights and IP', placeholder: 'Licences, trademarks, content you must not use' },
];
const PRICE_FIELDS = [
  { name: 'label', label: 'Product or seller' },
  { name: 'price', label: 'Price', money: true },
];

const rowSchema = (key) => validationSchema.shape[key].unwrap().element;
const toHref = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`);
const signalsOf = (idea) =>
  Object.fromEntries(
    IDEA_SIGNALS.map((k) => {
      const signal = idea.validation?.signals?.[k];
      return [k, { score: signal?.score ?? null, note: signal?.note ?? '' }];
    }),
  );
const notesOf = (idea) => Object.fromEntries(NOTE_FIELDS.map((f) => [f.name, idea.validation?.[f.name] ?? '']));

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function useSaveIdea(id) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const update = useUpdate('ideas');
  async function save(body, message, form) {
    try {
      const idea = await update.mutateAsync({ id, ...body });
      queryClient.setQueryData(['ideas', 'item', id], (old) => (old ? { ...old, ...idea } : old));
      toast.success(message);
      return idea;
    } catch (err) {
      form?.serverErrors(err);
      toast.error(err);
      return null;
    }
  }
  return { save, pending: update.isPending };
}

function SaveRow({ dirty, pending, label }) {
  return (
    <div className="mt-auto flex items-center justify-end gap-3 pt-5">
      {dirty && <span className="text-xs text-muted">Unsaved changes</span>}
      <Button type="submit" size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty} loading={pending}>
        {label}
      </Button>
    </div>
  );
}

function LinkOut({ url, label }) {
  if (!url) return null;
  return (
    <a href={toHref(url)} target="_blank" rel="noreferrer" title={url} aria-label={`Open ${label}`} className="shrink-0 text-faint hover:text-ink">
      <ExternalLink className="size-3.5" aria-hidden />
    </a>
  );
}

function RowForm({ fields, schema, onAdd, onDone, pending, className = '' }) {
  const blank = () => Object.fromEntries(fields.map((f) => [f.name, '']));
  const form = useForm(blank);

  async function submit(e) {
    e.preventDefault();
    const values = fields.map((f) => [f.name, f.money ? numberOrNull(form.values[f.name]) : form.values[f.name]]);
    const row = form.validate(schema, Object.fromEntries(values));
    if (row && (await onAdd(row, form))) form.setValues(blank());
  }

  return (
    <form onSubmit={submit} noValidate className={`grid w-full grid-cols-1 items-start gap-2 text-left ${className}`}>
      {fields.map((f, i) => (
        <FormField
          key={f.name}
          form={form}
          name={f.name}
          aria-label={f.label}
          placeholder={f.label}
          autoFocus={Boolean(onDone) && i === 0}
          {...(f.money && { type: 'number', min: '0', step: '1', inputMode: 'decimal', prefix: currencySymbol() })}
        />
      ))}
      <div className="flex items-center gap-2">
        <Button type="submit" icon={Plus} loading={pending}>
          Add
        </Button>
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            Done
          </Button>
        )}
      </div>
    </form>
  );
}

export function SignalsCard({ idea, className = '' }) {
  const saved = signalsOf(idea);
  const form = useForm(() => ({ validation: { signals: saved } }));
  const { save, pending } = useSaveIdea(idea._id);
  const signals = form.values.validation.signals;
  const dirty = JSON.stringify(signals) !== JSON.stringify(saved);
  const demand = ideaScores({ validation: { signals } }).demand;

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(ideaUpdateSchema, form.values);
    if (!body) return;
    const updated = await save(body, 'Signals saved', form);
    if (updated) form.setValues({ validation: { signals: signalsOf(updated) } });
  }

  return (
    <Card as="form" onSubmit={submit} noValidate className={`flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Validation signals"
        subtitle="What you have seen in the market, scored 0–10"
        className="mb-5"
        actions={
          <span className="text-[13px] text-muted">
            Demand <span className="font-semibold text-ink">{demand ?? DASH}</span>
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
        {IDEA_SIGNALS.map((k) => (
          <div key={k} className="min-w-0">
            <p className="text-[13px] font-medium text-ink">{LABELS.signal[k]}</p>
            <p className="mb-2 text-xs text-muted">{SIGNAL_HINTS[k]}</p>
            <ScoreInput label={LABELS.signal[k]} value={signals[k].score} onChange={(v) => form.set(`validation.signals.${k}.score`, v)} />
            <FormField
              form={form}
              name={`validation.signals.${k}.note`}
              aria-label={`${LABELS.signal[k]} note`}
              placeholder="What you saw: a number or link"
              className="mt-2"
            />
          </div>
        ))}
      </div>
      <SaveRow dirty={dirty} pending={pending} label="Save signals" />
    </Card>
  );
}

function EvidenceCard({ idea, field, nameKey, title, subtitle, icon, emptyTitle, emptyText, fields, formClass, children: renderItem }) {
  const items = idea.validation?.[field] ?? [];
  const [adding, setAdding] = useState(false);
  const { save, pending } = useSaveIdea(idea._id);
  const persist = (next, message, form) => save({ validation: { [field]: next } }, message, form);

  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5">
      <CardHeader
        title={title}
        subtitle={subtitle}
        className="mb-3"
        actions={
          items.length > 0 &&
          !adding && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
              Add
            </Button>
          )
        }
      />
      {items.length > 0 && (
        <ul className="divide-y divide-hairline-soft">
          {items.map((item, i) => (
            <li key={`${item[nameKey]}-${i}`} className="flex items-start gap-2 py-2.5">
              <div className="min-w-0 flex-1">{renderItem(item)}</div>
              <IconButton
                icon={X}
                size="icon-sm"
                label={`Remove ${item[nameKey]}`}
                disabled={pending}
                onClick={() => persist(items.filter((_, j) => j !== i), `${item[nameKey]} removed`)}
              />
            </li>
          ))}
        </ul>
      )}
      {!items.length && !adding && (
        <EmptyState
          compact
          className="flex-1"
          icon={icon}
          title={emptyTitle}
          description={emptyText}
          action={
            <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
              Add
            </Button>
          }
        />
      )}
      {adding && (
        <RowForm
          fields={fields}
          schema={rowSchema(field)}
          pending={pending}
          className={`mt-3 ${formClass}`}
          onDone={() => setAdding(false)}
          onAdd={(row, form) => persist([...items, row], `${row[nameKey]} added`, form)}
        />
      )}
    </Card>
  );
}

export function CompetitorsCard({ idea }) {
  return (
    <EvidenceCard
      idea={idea}
      field="competitors"
      nameKey="name"
      title="Competing products"
      subtitle="Who already sells this, and for how much"
      icon={Store}
      emptyTitle="No competitors logged."
      emptyText="Products already selling to this customer."
      formClass="sm:grid-cols-2"
      fields={[
        { name: 'name', label: 'Product or seller' },
        { name: 'price', label: 'Price', money: true },
        { name: 'url', label: 'Link' },
        { name: 'notes', label: 'What stands out' },
      ]}
    >
      {(c) => (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-ink">{c.name}</span>
              <LinkOut url={c.url} label={c.name} />
            </span>
            <span className="shrink-0 text-[13px] font-medium text-ink tabular-nums">{fmtCurrency(c.price)}</span>
          </div>
          {c.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{c.notes}</p>}
        </>
      )}
    </EvidenceCard>
  );
}

export function AdsCard({ idea }) {
  return (
    <EvidenceCard
      idea={idea}
      field="ads"
      nameKey="label"
      title="Existing ads"
      subtitle="Ads already running for similar products"
      icon={Megaphone}
      emptyTitle="No ads logged."
      emptyText="Long-running ads are a strong demand signal."
      formClass="sm:grid-cols-2"
      fields={[
        { name: 'label', label: 'Advertiser or hook' },
        { name: 'url', label: 'Ad library link' },
        { name: 'notes', label: 'How long it runs, angle, engagement' },
      ]}
    >
      {(a) => (
        <>
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-ink">{a.label}</span>
            <LinkOut url={a.url} label={a.label} />
          </span>
          {a.notes && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{a.notes}</p>}
        </>
      )}
    </EvidenceCard>
  );
}

export function PriceCheck({ idea, className }) {
  const examples = idea.validation?.priceExamples ?? [];
  const own = idea.expectedPrice;
  const { save, pending } = useSaveIdea(idea._id);
  const persist = (next, message, form) => save({ validation: { priceExamples: next } }, message, form);
  const items = [
    ...examples.map((e, i) => ({ key: String(i), label: e.label, value: e.price, muted: own != null })),
    ...(own != null ? [{ key: 'own', label: 'Your price', value: own }] : []),
  ].sort((a, b) => b.value - a.value);
  const mid = median(examples.map((e) => e.price));
  const diff = pctChange(own, mid);
  const position = diff == null ? null : Math.abs(diff) < 5 ? 'in line with' : `${fmtNumber(Math.abs(diff))}% ${diff < 0 ? 'below' : 'above'}`;
  const addForm = (
    <RowForm
      fields={PRICE_FIELDS}
      schema={rowSchema('priceExamples')}
      pending={pending}
      className="sm:grid-cols-[minmax(0,1fr)_8rem_auto]"
      onAdd={(row, form) => persist([...examples, row], `${row.label} added`, form)}
    />
  );

  return (
    <ChartCard
      className={className}
      title="Price check"
      subtitle={own != null ? 'Your expected price against market examples' : 'Market examples. Set an expected price to compare.'}
      height={null}
      empty={!examples.length}
      emptyMessage="No price examples yet. Add prices you have seen."
      emptyAction={addForm}
      table={{
        rowKey: 'key',
        columns: [
          { key: 'label', header: 'Example' },
          { key: 'value', header: 'Price', align: 'right', format: (v) => fmtCurrency(v) },
        ],
        rows: items,
      }}
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-4 xl:grid-cols-2">
        <div className="min-w-0">
          <BarList items={items} labelWidth="9rem" />
          {position && (
            <p className="mt-3 text-[13px] leading-snug text-muted">
              {fmtCurrency(own)} is {position} the median example ({fmtCurrency(Math.round(mid))}).
            </p>
          )}
        </div>
        <div className="min-w-0 border-t border-hairline-soft pt-4 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8">
          <ul className="mb-3 flex flex-wrap gap-1.5" aria-label="Price examples">
            {examples.map((e, i) => (
              <li key={`${e.label}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-tint py-0.5 pr-0.5 pl-2.5 text-xs text-body">
                {e.label} · {fmtCurrency(e.price)}
                <button
                  type="button"
                  aria-label={`Remove ${e.label}`}
                  disabled={pending}
                  onClick={() => persist(examples.filter((_, j) => j !== i), `${e.label} removed`)}
                  className="rounded-full p-0.5 text-muted hover:bg-tint-strong hover:text-ink disabled:opacity-50"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {addForm}
        </div>
      </div>
    </ChartCard>
  );
}

export function NotesCard({ idea, className = '' }) {
  const saved = notesOf(idea);
  const form = useForm(() => ({ validation: saved }));
  const { save, pending } = useSaveIdea(idea._id);
  const dirty = NOTE_FIELDS.some((f) => form.values.validation[f.name] !== saved[f.name]);

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(ideaUpdateSchema, form.values);
    if (!body) return;
    const updated = await save(body, 'Notes saved', form);
    if (updated) form.setValues({ validation: notesOf(updated) });
  }

  return (
    <Card as="form" onSubmit={submit} noValidate className={`flex min-w-0 flex-col p-4 sm:p-5 ${className}`}>
      <CardHeader title="Audience and rights" subtitle="Who it is for, why they buy, what you may not use" className="mb-4" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {NOTE_FIELDS.map((f) => (
          <FormField key={f.name} form={form} name={`validation.${f.name}`} label={f.label} as="textarea" rows={3} placeholder={f.placeholder} />
        ))}
      </div>
      <SaveRow dirty={dirty} pending={pending} label="Save notes" />
    </Card>
  );
}
