import { useId, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { LABELS, ORDER_ITEM_KINDS, PAYMENT_STATUSES, REFUND_STATUSES } from '@product-lab/shared/constants';
import { isoDateIn } from '@product-lab/shared/dates';
import { orderSchema, orderUpdateSchema } from '@product-lab/shared/schemas';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { FormField, Input, Select } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { choices, currencySymbol, fmtCurrency } from '../../lib/format.js';
import { numberOrUndefined, useForm } from '../../lib/form.js';
import { useList, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';

export const OPTIONS = {
  kind: choices(ORDER_ITEM_KINDS, LABELS.orderItemKind),
  paymentStatus: choices(PAYMENT_STATUSES, LABELS.paymentStatus),
  refundStatus: choices(REFUND_STATUSES, LABELS.refundStatus),
};
const CUSTOMER_MODES = [
  { value: 'email', label: 'By email' },
  { value: 'existing', label: 'Existing customer' },
];

function initialValues(order, defaults, today, timezone) {
  if (order) {
    return {
      productId: String(order.productId),
      experimentId: order.experimentId ? String(order.experimentId) : '',
      mode: 'existing',
      customerId: String(order.customerId),
      picked: order.customer,
      customer: { email: '', name: '' },
      items: order.items.map((i) => ({ kind: i.kind, name: i.name ?? '', amount: String(i.amount) })),
      date: isoDateIn(order.date, timezone),
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
      refundAmount: order.refundStatus === 'partial' ? String(order.refundAmount) : '',
      campaign: order.campaign ?? '',
      notes: order.notes ?? '',
    };
  }
  const product = defaults?.product;
  return {
    productId: product?._id ?? '',
    experimentId: defaults?.experimentId ?? '',
    mode: 'email',
    customerId: '',
    picked: null,
    customer: { email: '', name: '' },
    items: [{ kind: 'main', name: product?.name ?? '', amount: product ? String(product.price) : '' }],
    date: today,
    paymentStatus: 'paid',
    refundStatus: 'none',
    refundAmount: '',
    campaign: defaults?.campaign ?? '',
    notes: '',
  };
}

function CustomerPicker({ form }) {
  const [q, setQ] = useState('');
  const results = useList('customers', { q: q || undefined, sort: '-lastPurchaseAt', limit: 6 });
  const { customerId, picked } = form.values;
  const found = results.data?.items ?? [];
  const list = picked && !found.some((c) => c._id === picked._id) ? [picked, ...found] : found;
  const error = form.errors.customerId;

  return (
    <div className="space-y-2" onKeyDown={(e) => e.key === 'Enter' && e.target.type === 'search' && e.preventDefault()}>
      <SearchInput value={q} onChange={setQ} placeholder="Search name or email" />
      {results.isPending ? (
        <Skeleton className="h-28" />
      ) : list.length ? (
        <ul
          role="radiogroup"
          aria-label="Customer"
          className={`max-h-52 overflow-y-auto rounded-md border ${error ? 'border-negative' : 'border-hairline'}`}
        >
          {list.map((c) => {
            const active = c._id === customerId;
            return (
              <li key={c._id} role="none" className="border-b border-hairline-soft last:border-0">
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    form.set('customerId', c._id);
                    form.set('picked', c);
                  }}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${active ? 'bg-tint' : 'hover:bg-tint/50'}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{c.name || c.email}</span>
                    {c.name && <span className="block truncate text-xs text-muted">{c.email}</span>}
                  </span>
                  {c.totalSpent != null && <span className="shrink-0 text-xs text-muted tabular-nums">{fmtCurrency(c.totalSpent)}</span>}
                  <Check className={`size-4 shrink-0 ${active ? 'text-ink' : 'invisible'}`} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-hairline px-3 py-5 text-center text-[13px] text-muted">
          No customers match. Switch to “By email” to add one.
        </p>
      )}
      {error && (
        <p className="text-xs text-negative" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function OrderDialog({ onClose, order, defaults }) {
  const { today } = useDateRange();
  const { timezone } = useSettings().data;
  const toast = useToast();
  const campaignList = useId();
  const form = useForm(() => initialValues(order, defaults, today, timezone));
  const v = form.values;
  const products = useList('products', { sort: 'name' });
  const experiments = useList('experiments', { productId: v.productId }, { enabled: Boolean(v.productId) });
  const save = useMutate((body) => api(order ? `/orders/${order._id}` : '/orders', { method: order ? 'PATCH' : 'POST', body }));
  const productItems = products.data?.items ?? [];
  const experimentItems = experiments.data?.items ?? [];
  const total = v.items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
  const itemError = form.errors.items ?? Object.entries(form.errors).find(([key]) => key.startsWith('items.'))?.[1];

  const setItems = (update) => {
    form.setValues((x) => ({ ...x, items: update(x.items) }));
    form.setErrors((e) => Object.fromEntries(Object.entries(e).filter(([key]) => !key.startsWith('items'))));
  };
  const updateItem = (index, patch) => setItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const addItem = () =>
    setItems((items) => [
      ...items,
      { kind: ORDER_ITEM_KINDS.find((k) => !items.some((i) => i.kind === k)) ?? 'upsell', name: '', amount: '' },
    ]);

  function changeProduct(productId) {
    const prev = productItems.find((p) => p._id === v.productId);
    const next = productItems.find((p) => p._id === productId);
    form.set('productId', productId);
    form.set('experimentId', '');
    setItems((items) =>
      items.map((item) =>
        item.kind === 'main' && (!item.name || item.name === prev?.name)
          ? { ...item, name: next?.name ?? '', amount: next ? String(next.price) : item.amount }
          : item,
      ),
    );
  }

  function changeExperiment(experimentId) {
    form.set('experimentId', experimentId);
    const campaign = experimentItems.find((x) => x._id === experimentId)?.campaign;
    if (campaign && !v.campaign) form.set('campaign', campaign);
  }

  async function submit() {
    const unchangedDate = order && v.date === isoDateIn(order.date, timezone);
    const body = form.validate(order ? orderUpdateSchema : orderSchema, {
      productId: v.productId || undefined,
      experimentId: v.experimentId || null,
      ...(v.mode === 'existing' ? { customerId: v.customerId || undefined } : { customer: v.customer }),
      items: v.items.map((i) => ({ kind: i.kind, name: i.name, amount: numberOrUndefined(i.amount) })),
      date: unchangedDate ? undefined : v.date === today ? new Date().toISOString() : v.date || undefined,
      paymentStatus: v.paymentStatus,
      refundStatus: v.refundStatus,
      refundAmount: v.refundStatus === 'partial' ? numberOrUndefined(v.refundAmount) : undefined,
      campaign: v.campaign,
      notes: v.notes,
    });
    if (!body) return;
    if (!body.customerId && !body.customer) return form.setErrors({ customerId: 'Choose a customer' });
    try {
      await save.mutateAsync(body);
      toast.success(order ? 'Order updated' : `Order added · ${fmtCurrency(total)}`);
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
      title={order ? 'Edit order' : 'Add order'}
      description="The main product plus any bump, upsell or bundle. Customer totals update automatically."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {order ? 'Save changes' : 'Add order'}
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
            placeholder="Choose a product"
            options={productItems.map((p) => ({ value: p._id, label: p.name }))}
            onChange={(e) => changeProduct(e.target.value)}
          />
          <FormField
            form={form}
            name="experimentId"
            label="Experiment"
            as="select"
            disabled={!v.productId || experiments.isPlaceholderData}
            placeholder="No experiment"
            options={experimentItems.map((x) => ({ value: x._id, label: x.name }))}
            onChange={(e) => changeExperiment(e.target.value)}
          />
        </div>

        <div role="group" aria-label="Customer">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-body">
              Customer <span className="text-negative">*</span>
            </span>
            <SegmentedControl
              size="sm"
              label="Customer source"
              options={CUSTOMER_MODES}
              value={v.mode}
              onChange={(mode) => form.set('mode', mode)}
            />
          </div>
          {v.mode === 'email' ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                form={form}
                name="customer.email"
                label="Email"
                type="email"
                autoComplete="off"
                spellCheck={false}
                required
                placeholder="name@example.com"
                hint="Matched to the existing customer when already on file"
              />
              <FormField form={form} name="customer.name" label="Name" placeholder="Optional" />
            </div>
          ) : (
            <CustomerPicker form={form} />
          )}
        </div>

        <div role="group" aria-label="Items">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-body">
              Items <span className="text-negative">*</span>
            </span>
            <span className="text-[13px] text-muted">
              Total <span className="font-semibold text-ink tabular-nums">{fmtCurrency(total)}</span>
            </span>
          </div>
          <ul className="space-y-2">
            {v.items.map((item, i) => (
              <li
                key={i}
                className="grid grid-flow-row-dense grid-cols-[minmax(0,1fr)_7rem_auto] gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_8rem_auto]"
              >
                <Select
                  aria-label={`Item ${i + 1} type`}
                  options={OPTIONS.kind}
                  value={item.kind}
                  onChange={(e) => updateItem(i, { kind: e.target.value })}
                />
                <Input
                  aria-label={`Item ${i + 1} name`}
                  className="col-span-3 sm:col-span-1"
                  placeholder="Name (optional)"
                  value={item.name}
                  invalid={Boolean(form.errors[`items.${i}.name`])}
                  onChange={(e) => updateItem(i, { name: e.target.value })}
                />
                <Input
                  aria-label={`Item ${i + 1} amount`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  prefix={currencySymbol()}
                  placeholder="0"
                  value={item.amount}
                  invalid={Boolean(form.errors[`items.${i}.amount`])}
                  onChange={(e) => updateItem(i, { amount: e.target.value })}
                />
                <IconButton
                  icon={X}
                  label={`Remove item ${i + 1}`}
                  disabled={v.items.length === 1}
                  onClick={() => setItems((items) => items.filter((_, j) => j !== i))}
                />
              </li>
            ))}
          </ul>
          {itemError && (
            <p className="mt-1.5 text-xs text-negative" role="alert">
              {itemError}
            </p>
          )}
          <Button size="sm" variant="ghost" icon={Plus} className="mt-2" disabled={v.items.length >= 20} onClick={addItem}>
            Add item
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FormField form={form} name="date" label="Date" type="date" required />
          <FormField form={form} name="paymentStatus" label="Payment" as="select" options={OPTIONS.paymentStatus} />
          <FormField form={form} name="refundStatus" label="Refund" as="select" options={OPTIONS.refundStatus} />
          {v.refundStatus === 'partial' && (
            <FormField
              form={form}
              name="refundAmount"
              label="Refunded"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              prefix={currencySymbol()}
              required
            />
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField form={form} name="campaign" label="Campaign" list={campaignList} placeholder="Campaign name in Ads Manager" />
          <FormField form={form} name="notes" label="Notes" placeholder="Optional" />
        </div>
        <datalist id={campaignList}>
          {(experiments.data?.facets?.campaigns ?? []).map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
    </Modal>
  );
}

export function OrderFormModal({ open, ...props }) {
  return open ? <OrderDialog {...props} /> : null;
}
