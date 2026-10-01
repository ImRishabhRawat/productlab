import { useId } from 'react';
import { LABELS, PRODUCT_STATUSES } from '@product-lab/shared/constants';
import { productSchema, productUpdateSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { choices, currencySymbol } from '../../lib/format.js';
import { numberOrNull, numberOrUndefined, str, useForm } from '../../lib/form.js';
import { useList, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';

const editSchema = productUpdateSchema.required({ name: true, price: true });
const STATUS_OPTIONS = choices(PRODUCT_STATUSES, LABELS.status);

function initialValues(product, settings) {
  const p = product ?? {};
  const costs = product
    ? (p.costs ?? {})
    : { paymentFeePct: settings?.defaultPaymentFeePct, refundRatePct: settings?.defaultRefundRatePct, variableCostPerSale: settings?.defaultVariableCostPerSale };
  return {
    name: p.name ?? '',
    category: p.category ?? '',
    description: p.description ?? '',
    format: p.format ?? '',
    deliverable: p.deliverable ?? '',
    targetCustomer: p.targetCustomer ?? '',
    price: str(p.price),
    status: p.status ?? 'ready_to_test',
    costs: { paymentFeePct: str(costs.paymentFeePct), refundRatePct: str(costs.refundRatePct), variableCostPerSale: str(costs.variableCostPerSale) },
    desiredMarginPct: str(product ? p.desiredMarginPct : settings?.defaultDesiredMarginPct),
    budget: { daily: str(p.budget?.daily), monthly: str(p.budget?.monthly) },
    killReason: p.killReason ?? '',
    learnings: p.learnings ?? '',
  };
}

function ProductDialog({ onClose, product, onSaved }) {
  const toast = useToast();
  const settings = useSettings();
  const listId = useId();
  const form = useForm(() => initialValues(product, settings.data));
  const products = useList('products', { sort: 'name' });
  const killed = product?.status === 'killed';
  const save = useMutate((body) => (product ? api(`/products/${product._id}`, { method: 'PATCH', body }) : api('/products', { method: 'POST', body })));

  async function submit() {
    const v = form.values;
    const body = {
      name: v.name,
      category: v.category,
      description: v.description,
      format: v.format,
      deliverable: v.deliverable,
      targetCustomer: v.targetCustomer,
      price: numberOrUndefined(v.price),
      costs: {
        paymentFeePct: Number(v.costs.paymentFeePct || 0),
        refundRatePct: Number(v.costs.refundRatePct || 0),
        variableCostPerSale: Number(v.costs.variableCostPerSale || 0),
      },
      desiredMarginPct: Number(v.desiredMarginPct || 0),
      budget: { daily: numberOrNull(v.budget.daily), monthly: numberOrNull(v.budget.monthly) },
      ...(product ? killed && { killReason: v.killReason, learnings: v.learnings } : { status: v.status }),
    };
    const valid = form.validate(product ? editSchema : productSchema, body);
    if (!valid) return;
    try {
      const saved = await save.mutateAsync(valid);
      toast.success(product ? 'Product updated' : 'Product created');
      onClose();
      onSaved?.(saved);
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  const money = { type: 'number', min: '0', step: '0.01', inputMode: 'decimal', prefix: currencySymbol() };
  const pct = { type: 'number', min: '0', max: '100', step: '0.1', inputMode: 'decimal', suffix: '%' };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={product ? 'Edit product' : 'New product'}
      description={product ? 'Price changes are logged to the product history.' : 'Costs and margin drive the break-even CAC and ROAS.'}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {product ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField form={form} name="name" label="Name" required autoFocus placeholder="AI Kids Videos" />
          <FormField form={form} name="category" label="Category" list={listId} placeholder="Parenting" />
          <datalist id={listId}>
            {(products.data?.facets?.categories ?? []).map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FormField form={form} name="price" label="Price" required {...money} />
          {!product && <FormField form={form} name="status" label="Status" as="select" options={STATUS_OPTIONS} />}
          <FormField form={form} name="format" label="Format" placeholder="Video pack" />
        </div>
        <FormField form={form} name="description" label="Description" as="textarea" rows={2} placeholder="One line on what it is" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField form={form} name="deliverable" label="Deliverable" placeholder="What the buyer receives" />
          <FormField form={form} name="targetCustomer" label="Target customer" placeholder="Who buys it" />
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-body">Unit economics</legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FormField form={form} name="costs.paymentFeePct" label="Payment fee" placeholder="0" {...pct} />
            <FormField form={form} name="costs.refundRatePct" label="Expected refunds" placeholder="0" {...pct} />
            <FormField form={form} name="costs.variableCostPerSale" label="Other cost / sale" placeholder="0" {...money} />
            <FormField form={form} name="desiredMarginPct" label="Desired margin" placeholder="0" {...pct} />
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-body">Ad budget</legend>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FormField form={form} name="budget.daily" label="Daily" placeholder="None" {...money} />
            <FormField form={form} name="budget.monthly" label="Monthly" placeholder="None" {...money} />
          </div>
        </fieldset>

        {killed && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField form={form} name="killReason" label="Why it was killed" as="textarea" rows={3} />
            <FormField form={form} name="learnings" label="Learnings" as="textarea" rows={3} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ProductFormModal({ open, ...props }) {
  return open ? <ProductDialog {...props} /> : null;
}
