import { useRef } from 'react';
import { addDays } from '@product-lab/shared/dates';
import { deriveMetrics, variableCosts } from '@product-lab/shared/metrics';
import { metricSchema, metricUpdateSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { currencySymbol, fmtDate, fmtMetric } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { shortLabel } from '../../lib/metricDisplay.js';
import { useList, useMutate } from '../../lib/queries.js';

const NUMBER_FIELDS = [
  { name: 'spend', label: 'Spend', money: true },
  { name: 'impressions', label: 'Impressions' },
  { name: 'reach', label: 'Reach' },
  { name: 'clicks', label: 'Clicks' },
  { name: 'landingPageViews', label: 'Landing page views' },
  { name: 'checkouts', label: 'Checkouts started' },
  { name: 'purchases', label: 'Purchases' },
  { name: 'revenue', label: 'Revenue', money: true },
];
const PREVIEW = ['ctr', 'cpc', 'cpm', 'checkoutRate', 'conversionRate', 'cac', 'roas', 'aov', 'contribution'];
const toNumber = (v) => (v === '' || v == null ? 0 : Number(v));
const emptyNumbers = () => Object.fromEntries(NUMBER_FIELDS.map((f) => [f.name, '']));

function initialValues(entry, defaults, today) {
  if (entry) {
    return {
      date: entry.date,
      productId: String(entry.productId),
      experimentId: entry.experimentId ? String(entry.experimentId) : '',
      creativeId: entry.creativeId ? String(entry.creativeId) : '',
      campaign: entry.campaign ?? '',
      notes: entry.notes ?? '',
      ...Object.fromEntries(NUMBER_FIELDS.map((f) => [f.name, String(entry[f.name] ?? '')])),
    };
  }
  return {
    date: today,
    productId: defaults?.productId ?? '',
    experimentId: defaults?.experimentId ?? '',
    creativeId: defaults?.creativeId ?? '',
    campaign: '',
    notes: '',
    ...emptyNumbers(),
  };
}

function MetricEntryDialog({ onClose, defaults, entry }) {
  const { today } = useDateRange();
  const toast = useToast();
  const form = useForm(() => initialValues(entry, defaults, today));
  const firstNumber = useRef(null);
  const { productId, experimentId } = form.values;

  const products = useList('products', { sort: 'name' });
  const experiments = useList('experiments', { productId }, { enabled: Boolean(productId) });
  const creatives = useList('creatives', { experimentId }, { enabled: Boolean(experimentId) });
  const product = products.data?.items.find((p) => p._id === productId);

  const numbers = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.name, toNumber(form.values[f.name])]));
  const preview = deriveMetrics({ ...numbers, ...variableCosts(numbers, product?.costs) });

  const save = useMutate((body) => (entry ? api(`/metrics/${entry._id}`, { method: 'PATCH', body }) : api('/metrics', { method: 'POST', body })));

  function payload() {
    const base = { date: form.values.date, campaign: form.values.campaign, notes: form.values.notes, ...numbers };
    if (entry) return form.validate(metricUpdateSchema, base);
    return form.validate(metricSchema, {
      ...base,
      productId: productId || undefined,
      experimentId: experimentId || null,
      creativeId: form.values.creativeId || null,
    });
  }

  async function submit(next = false) {
    const body = payload();
    if (!body) return;
    try {
      await save.mutateAsync(body);
      toast.success(`Metrics saved for ${fmtDate(body.date)}`);
      if (!next) return onClose();
      form.setValues((v) => ({ ...v, ...emptyNumbers(), notes: '', date: addDays(v.date, 1) }));
      firstNumber.current?.focus();
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  const option = (items = []) => items.map((i) => ({ value: i._id, label: i.name }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={entry ? 'Edit metrics' : 'Record metrics'}
      description="Enter what the ad platform reports. Rates, CAC and ROAS are calculated for you."
      onSubmit={() => submit(false)}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!entry && (
            <Button onClick={() => submit(true)} disabled={save.isPending}>
              Save &amp; next day
            </Button>
          )}
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField form={form} name="date" label="Date" type="date" required />
            <FormField
              form={form}
              name="productId"
              label="Product"
              as="select"
              required
              disabled={Boolean(entry)}
              placeholder="Choose a product"
              options={option(products.data?.items)}
              onChange={(e) => form.setValues((v) => ({ ...v, productId: e.target.value, experimentId: '', creativeId: '' }))}
            />
            <FormField
              form={form}
              name="experimentId"
              label="Experiment"
              as="select"
              disabled={Boolean(entry) || !productId}
              placeholder="No experiment"
              options={option(experiments.data?.items)}
              onChange={(e) => form.setValues((v) => ({ ...v, experimentId: e.target.value, creativeId: '' }))}
            />
            <FormField
              form={form}
              name="creativeId"
              label="Creative"
              as="select"
              disabled={Boolean(entry) || !experimentId}
              placeholder="No specific creative"
              options={option(creatives.data?.items)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {NUMBER_FIELDS.map((f, i) => (
              <FormField
                key={f.name}
                form={form}
                name={f.name}
                label={f.label}
                type="number"
                min="0"
                step={f.money ? '0.01' : '1'}
                inputMode={f.money ? 'decimal' : 'numeric'}
                prefix={f.money ? currencySymbol() : undefined}
                placeholder="0"
                ref={i === 0 ? firstNumber : undefined}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField form={form} name="campaign" label="Campaign" placeholder="Defaults to the experiment's campaign" />
            <FormField form={form} name="notes" label="Notes" placeholder="Optional" />
          </div>
        </div>
        <aside className="rounded-lg bg-tint/60 p-4" aria-live="polite">
          <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Calculated</h3>
          <dl className="mt-3 space-y-2">
            {PREVIEW.map((key) => (
              <div key={key} className="flex items-baseline justify-between gap-2 text-[13px]">
                <dt className="text-muted">{shortLabel(key)}</dt>
                <dd className={`font-medium tabular-nums ${key === 'contribution' && preview.contribution < 0 ? 'text-negative' : 'text-ink'}`}>
                  {fmtMetric(key, preview[key])}
                </dd>
              </div>
            ))}
          </dl>
          {!product && <p className="mt-3 text-xs text-muted">Choose a product to include its fees and refund costs.</p>}
        </aside>
      </div>
    </Modal>
  );
}

export function MetricEntryModal({ open, ...props }) {
  return open ? <MetricEntryDialog {...props} /> : null;
}
