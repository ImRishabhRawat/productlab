import { Copy } from 'lucide-react';
import { EXPERIMENT_STATUSES, EXPERIMENT_VARIABLES, LABELS } from '@product-lab/shared/constants';
import { experimentSchema, experimentUpdateSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { choices, currencySymbol } from '../../lib/format.js';
import { numberOrNull, str, useForm } from '../../lib/form.js';
import { useList, useMutate } from '../../lib/queries.js';
import { needsStart } from './ExperimentParts.jsx';

const TEXT_VARIABLES = EXPERIMENT_VARIABLES.filter((v) => v.key !== 'price');
const STATUS_OPTIONS = choices(EXPERIMENT_STATUSES, LABELS.experimentStatus);

function initialValues(experiment, productId) {
  const x = experiment ?? {};
  return {
    productId: x.productId ? String(x.productId) : (productId ?? ''),
    name: x.name ?? '',
    status: x.status ?? 'planned',
    hypothesis: x.hypothesis ?? '',
    changeNote: x.changeNote ?? '',
    variables: Object.fromEntries(EXPERIMENT_VARIABLES.map((v) => [v.key, str(x.variables?.[v.key])])),
    budget: str(x.budget),
    dailyBudget: str(x.dailyBudget),
    startDate: x.startDate ?? '',
    endDate: x.endDate ?? '',
    campaign: x.campaign ?? '',
    notes: x.notes ?? '',
  };
}

function ExperimentDialog({ onClose, experiment, productId, onSaved }) {
  const { today } = useDateRange();
  const toast = useToast();
  const form = useForm(() => initialValues(experiment, productId));
  const products = useList('products', { sort: 'name' });
  const previous = useList('experiments', { productId: form.values.productId }, { enabled: !experiment && Boolean(form.values.productId) });
  const latest = previous.data?.items[0];
  const save = useMutate((body) =>
    experiment ? api(`/experiments/${experiment._id}`, { method: 'PATCH', body }) : api('/experiments', { method: 'POST', body }),
  );

  const setStatus = (status) =>
    form.setValues((v) => ({ ...v, status, startDate: status === 'running' && needsStart(v.startDate, today) ? today : v.startDate }));

  function copyLatest() {
    form.setValues((v) => ({
      ...v,
      variables: Object.fromEntries(EXPERIMENT_VARIABLES.map((x) => [x.key, str(latest.variables?.[x.key])])),
      campaign: v.campaign || latest.campaign || '',
    }));
  }

  async function submit() {
    const v = form.values;
    const body = {
      name: v.name,
      status: v.status,
      hypothesis: v.hypothesis,
      changeNote: v.changeNote,
      variables: { ...v.variables, price: numberOrNull(v.variables.price) },
      budget: numberOrNull(v.budget),
      dailyBudget: numberOrNull(v.dailyBudget),
      startDate: v.startDate || null,
      endDate: v.endDate || null,
      campaign: v.campaign,
      notes: v.notes,
    };
    const valid = experiment
      ? form.validate(experimentUpdateSchema, body)
      : form.validate(experimentSchema, { ...body, productId: v.productId || undefined });
    if (!valid) return;
    try {
      const saved = await save.mutateAsync(valid);
      toast.success(experiment ? 'Experiment updated' : 'Experiment created');
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
      size="lg"
      title={experiment ? 'Edit experiment' : 'New experiment'}
      description="Record the variables so you can see what changed between tests."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {experiment ? 'Save changes' : 'Create experiment'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            form={form}
            name="productId"
            label="Product"
            as="select"
            required
            disabled={Boolean(experiment || productId)}
            placeholder="Choose a product"
            options={(products.data?.items ?? []).map((p) => ({ value: p._id, label: p.name }))}
          />
          <FormField form={form} name="name" label="Name" required placeholder="Price Test #2" autoFocus />
          <FormField
            form={form}
            name="status"
            label="Status"
            as="select"
            options={STATUS_OPTIONS}
            onChange={(e) => setStatus(e.target.value)}
          />
          <FormField form={form} name="campaign" label="Campaign" placeholder="Campaign name in Ads Manager" />
        </div>
        <FormField form={form} name="hypothesis" label="Hypothesis" as="textarea" rows={2} placeholder="What do you expect, and why?" />

        <fieldset>
          <div className="mb-2 flex items-center justify-between gap-2">
            <legend className="text-[13px] font-medium text-body">Variables</legend>
            {!experiment && latest && (
              <Button size="sm" variant="ghost" icon={Copy} onClick={copyLatest}>
                Copy from {latest.name}
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField form={form} name="variables.price" label="Price" type="number" min="0" step="0.01" prefix={currencySymbol()} />
            {TEXT_VARIABLES.map((v) => (
              <FormField key={v.key} form={form} name={`variables.${v.key}`} label={v.label} />
            ))}
          </div>
        </fieldset>

        <FormField form={form} name="changeNote" label="What changed vs the previous test" placeholder="e.g. Price ₹99 → ₹199" />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField form={form} name="startDate" label="Start date" type="date" />
          <FormField form={form} name="endDate" label="End date" type="date" />
          <FormField form={form} name="budget" label="Total budget" type="number" min="0" step="0.01" prefix={currencySymbol()} />
          <FormField form={form} name="dailyBudget" label="Daily budget" type="number" min="0" step="0.01" prefix={currencySymbol()} />
        </div>
        <FormField form={form} name="notes" label="Notes" as="textarea" rows={2} />
      </div>
    </Modal>
  );
}

export function ExperimentFormModal({ open, ...props }) {
  return open ? <ExperimentDialog {...props} /> : null;
}
