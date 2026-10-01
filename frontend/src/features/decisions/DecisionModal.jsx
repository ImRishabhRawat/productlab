import { DECISION_STATUS, DECISIONS, LABELS } from '@product-lab/shared/constants';
import { decisionSchema } from '@product-lab/shared/schemas';
import { Dot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Checkbox, FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtMetric } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { shortLabel } from '../../lib/metricDisplay.js';
import { useAnalytics, useMutate } from '../../lib/queries.js';
import { statusMeta } from '../../lib/status.js';

const EVIDENCE = ['purchases', 'revenue', 'spend', 'cac', 'roas', 'conversionRate', 'contribution'];
const STOPPING = ['killed', 'paused'];

export function EvidenceGrid({ totals, loading }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      {EVIDENCE.map((key) => (
        <div key={key}>
          <dt className="text-xs text-muted">{shortLabel(key)}</dt>
          <dd className={`mt-0.5 text-[15px] font-semibold tabular-nums ${key === 'contribution' && totals?.[key] < 0 ? 'text-negative' : 'text-ink'}`}>
            {loading ? <Skeleton className="h-5 w-16" /> : fmtMetric(key, totals?.[key])}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function stopNote({ target, movesProduct, experimentId }) {
  if (!STOPPING.includes(target)) return null;
  if (movesProduct) return 'Running experiments on this product will be stopped.';
  return experimentId ? 'This experiment will be stopped.' : null;
}

function DecisionDialog({ onClose, productId, experimentId, productStatus }) {
  const { today } = useDateRange();
  const toast = useToast();
  const evidence = useAnalytics('summary', { productId, experimentId });
  const form = useForm({ decision: '', reason: '', notes: '', date: today, applyStatus: !experimentId });
  const save = useMutate((body) => api('/decisions', { method: 'POST', body }));
  const target = form.values.decision ? DECISION_STATUS[form.values.decision] : null;
  const changesStatus = target && target !== productStatus;
  const note = stopNote({ target, movesProduct: changesStatus && form.values.applyStatus, experimentId });

  async function submit() {
    const body = form.validate(decisionSchema, {
      productId,
      experimentId: experimentId || null,
      decision: form.values.decision || undefined,
      reason: form.values.reason,
      notes: form.values.notes,
      date: form.values.date,
      applyStatus: Boolean(changesStatus && form.values.applyStatus),
    });
    if (!body) return;
    try {
      await save.mutateAsync(body);
      toast.success('Decision recorded');
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
      size="lg"
      title="Record a decision"
      description="The evidence below is context, not a verdict. The call is yours."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Record decision
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-lg bg-tint/60 p-4">
          <h3 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
            Purchase signal · {experimentId ? 'this experiment' : 'all time'}
          </h3>
          <EvidenceGrid totals={evidence.data?.current} loading={evidence.isPending} />
        </section>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-body">
            Decision <span className="text-negative">*</span>
          </legend>
          <div
            role="radiogroup"
            aria-label="Decision"
            aria-invalid={Boolean(form.errors.decision) || undefined}
            tabIndex={-1}
            className="grid grid-cols-1 gap-2 rounded-md sm:grid-cols-5"
          >
            {DECISIONS.map((d, i) => {
              const selected = form.values.decision === d;
              const meta = statusMeta('decision', d);
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-autofocus={i === 0 || undefined}
                  onClick={() => form.set('decision', d)}
                  className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition-colors ${
                    selected ? 'border-ink bg-canvas ring-1 ring-ink' : 'border-hairline bg-canvas hover:bg-tint/60'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <Dot color={meta.color} />
                    {LABELS.decision[d]}
                  </span>
                  <span className="text-[11px] text-muted">→ {LABELS.status[DECISION_STATUS[d]]}</span>
                </button>
              );
            })}
          </div>
          {form.errors.decision && <p className="mt-1 text-xs text-negative">Choose a decision</p>}
        </fieldset>

        <FormField form={form} name="reason" label="Reason" as="textarea" rows={2} required placeholder="What in the evidence drives this call?" />
        <FormField
          form={form}
          name="notes"
          label={form.values.decision === 'kill' ? 'What did you learn?' : 'Notes'}
          as="textarea"
          rows={2}
          placeholder={form.values.decision === 'kill' ? 'Kept in the graveyard so the lesson is not lost' : 'Optional'}
        />
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FormField form={form} name="date" label="Date" type="date" max={today} className="w-44" />
            {changesStatus && (
              <Checkbox
                checked={form.values.applyStatus}
                onChange={(e) => form.set('applyStatus', e.target.checked)}
                label={`Move product to ${LABELS.status[target]}`}
              />
            )}
          </div>
          {note && <p className="mt-2 text-xs text-muted">{note}</p>}
        </div>
      </div>
    </Modal>
  );
}

export function DecisionModal({ open, ...props }) {
  return open ? <DecisionDialog {...props} /> : null;
}
