import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ideaScores } from '@product-lab/shared/metrics';
import { ideaSchema, ideaUpdateSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { Field, FormField, ScoreInput } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { currencySymbol, DASH } from '../../lib/format.js';
import { numberOrNull, useForm } from '../../lib/form.js';
import { useList, useMutate } from '../../lib/queries.js';
import { STATUS_OPTIONS } from './IdeaScores.jsx';

const TEXT_FIELDS = ['name', 'category', 'format', 'targetCustomer', 'problem', 'deliverable', 'source', 'notes'];
const SCORE_FIELDS = [
  { name: 'effort', label: 'Production effort', hint: '0 = a weekend, 10 = months of work' },
  { name: 'demonstrability', label: 'Ad demonstrability', hint: 'Can an ad show the result in seconds?' },
  { name: 'repeatPotential', label: 'Repeat purchase potential', hint: 'Will buyers come back for more?' },
  { name: 'legalRisk', label: 'Legal / IP risk', hint: '10 = likely takedown or dispute' },
];
const unique = (values) => [...new Set(values.filter(Boolean))].sort();

function initialValues(idea) {
  return {
    ...Object.fromEntries(TEXT_FIELDS.map((k) => [k, idea[k] ?? ''])),
    ...Object.fromEntries(SCORE_FIELDS.map((f) => [f.name, idea[f.name] ?? null])),
    expectedPrice: idea.expectedPrice == null ? '' : String(idea.expectedPrice),
    status: idea.status ?? 'idea',
  };
}

function IdeaDialog({ onClose, idea, onSaved }) {
  const toast = useToast();
  const listId = useId();
  const nameRef = useRef(null);
  const form = useForm(() => initialValues(idea ?? {}));
  const [more, setMore] = useState(Boolean(idea));
  const ideas = useList('ideas');
  const save = useMutate((body) => (idea ? api(`/ideas/${idea._id}`, { method: 'PATCH', body }) : api('/ideas', { method: 'POST', body })));
  const canSetStatus = Boolean(idea) && idea.status !== 'converted';
  const { values } = form;
  const potential = ideaScores({ ...values, validation: idea?.validation }).potential;

  useEffect(() => nameRef.current?.focus(), []);

  async function submit() {
    const { expectedPrice, status, ...rest } = values;
    const body = form.validate(idea ? ideaUpdateSchema : ideaSchema, {
      ...rest,
      expectedPrice: numberOrNull(expectedPrice),
      ...(canSetStatus && { status }),
    });
    if (!body) return;
    try {
      const saved = await save.mutateAsync(body);
      toast.success(idea ? 'Idea updated' : 'Idea created');
      onClose();
      onSaved?.(saved);
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={idea ? 'Edit idea' : 'New idea'}
      description={idea ? 'Scores update the potential straight away.' : 'Capture it now. Add details and scores whenever you like.'}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {idea ? 'Save changes' : 'Create idea'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className={canSetStatus ? 'grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]' : undefined}>
          <FormField form={form} name="name" label="Name" required placeholder="e.g. Notion budget planner" ref={nameRef} />
          {canSetStatus && <FormField form={form} name="status" label="Status" as="select" options={STATUS_OPTIONS} />}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField form={form} name="category" label="Category" placeholder="e.g. Finance" list={`${listId}-c`} autoComplete="off" />
          <FormField
            form={form}
            name="expectedPrice"
            label="Expected price"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            prefix={currencySymbol()}
            placeholder="0"
          />
          <FormField form={form} name="format" label="Product format" placeholder="e.g. Canva templates" list={`${listId}-f`} autoComplete="off" />
        </div>
        <datalist id={`${listId}-c`}>
          {(ideas.data?.facets?.categories ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <datalist id={`${listId}-f`}>
          {unique((ideas.data?.items ?? []).map((i) => i.format)).map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="flex w-full min-w-0 items-center gap-2 border-t border-hairline-soft pt-4 text-left text-[13px] font-medium text-ink"
        >
          <ChevronDown className={`size-4 shrink-0 text-muted transition-transform ${more ? 'rotate-180' : ''}`} aria-hidden />
          More details
          {!more && <span className="truncate font-normal text-muted">customer, deliverable, scores, notes</span>}
        </button>

        {more && (
          <div className="space-y-4">
            <FormField form={form} name="targetCustomer" label="Target customer" placeholder="Who buys it?" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField form={form} name="problem" label="Problem or desire" as="textarea" rows={2} placeholder="What do they want solved?" />
              <FormField
                form={form}
                name="deliverable"
                label="What the customer receives"
                as="textarea"
                rows={2}
                placeholder="e.g. 60 editable templates"
              />
            </div>
            <section aria-label="Scores">
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-medium text-ink">Your scores, 0–10</h3>
                <span className="text-xs text-muted">
                  Potential <span className="font-semibold text-ink">{potential ?? DASH}</span> / 100
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
                {SCORE_FIELDS.map((f) => (
                  <Field key={f.name} label={f.label} hint={f.hint} error={form.errors[f.name]}>
                    <ScoreInput label={f.label} value={values[f.name]} onChange={(v) => form.set(f.name, v)} />
                  </Field>
                ))}
              </div>
            </section>
            <FormField form={form} name="source" label="Source" placeholder="Where the idea came from" />
            <FormField form={form} name="notes" label="Notes" as="textarea" rows={3} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function IdeaFormModal({ open, ...props }) {
  return open ? <IdeaDialog {...props} /> : null;
}
