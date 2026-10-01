import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { customerUpdateSchema } from '@product-lab/shared/schemas';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Stat } from '../../components/ui/Card.jsx';
import { DataTable } from '../../components/ui/DataTable.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { fmtCurrency, fmtDate, fmtNumber, fmtRelative } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { useItem, useRemove, useUpdate } from '../../lib/queries.js';
import { ItemChips, OrderAmount } from '../orders/OrderParts.jsx';

const FIELDS = ['name', 'phone', 'notes'];
const HEADING = 'mb-2 text-xs font-medium tracking-wide text-muted uppercase';

const ORDER_COLUMNS = [
  { key: 'date', header: 'Date', className: 'whitespace-nowrap', format: (v) => fmtDate(v, { year: true }) },
  { key: 'productName', header: 'Product', render: (o) => <span className="block max-w-44 truncate">{o.productName}</span> },
  { key: 'items', header: 'Items', sortable: false, render: (o) => <ItemChips items={o.items} /> },
  { key: 'amount', header: 'Amount', align: 'right', render: (o) => <OrderAmount order={o} /> },
  {
    key: 'paymentStatus',
    header: 'Status',
    render: (o) => (
      <div className="flex flex-wrap gap-1">
        <StatusBadge kind="paymentStatus" value={o.paymentStatus} />
        {o.refundStatus !== 'none' && <StatusBadge kind="refundStatus" value={o.refundStatus} />}
      </div>
    ),
  },
];

function CustomerBody({ customer, onClose, onRemoving }) {
  const toast = useToast();
  const initial = Object.fromEntries(FIELDS.map((k) => [k, customer[k] ?? '']));
  const form = useForm(() => initial);
  const update = useUpdate('customers');
  const remove = useRemove('customers', { onMutate: () => onRemoving(true), onError: () => onRemoving(false) });
  const [confirming, setConfirming] = useState(false);
  const dirty = FIELDS.some((k) => form.values[k] !== initial[k]);
  const unpaid = customer.orders.length - customer.orderCount;

  async function save() {
    const body = form.validate(customerUpdateSchema, form.values);
    if (!body) return;
    try {
      await update.mutateAsync({ id: customer._id, ...body });
      toast.success('Customer updated');
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  const destroy = () =>
    remove.mutate(customer._id, {
      onSuccess: () => {
        toast.success('Customer deleted');
        onClose();
      },
      onError: (err) => {
        setConfirming(false);
        toast.error(err);
      },
    });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Lifetime spend" value={fmtCurrency(customer.totalSpent)} sub="Paid, net of refunds" />
        <Stat label="Paid orders" value={fmtNumber(customer.orderCount)} sub={unpaid > 0 ? `+${fmtNumber(unpaid)} unpaid` : undefined} />
        <Stat label="First purchase" value={fmtDate(customer.firstPurchaseAt, { year: true })} />
        <Stat
          label="Last purchase"
          value={fmtDate(customer.lastPurchaseAt, { year: true })}
          sub={customer.lastPurchaseAt ? fmtRelative(customer.lastPurchaseAt) : undefined}
        />
      </div>

      <section>
        <h3 className={HEADING}>Products owned</h3>
        {customer.products.length ? (
          <div className="flex flex-wrap gap-1.5">
            {customer.products.map((p) => (
              <Link key={p._id} to={`/products/${p._id}`} className="rounded-full hover:opacity-80">
                <Badge>{p.name}</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-muted">No paid purchases yet.</p>
        )}
      </section>

      <section>
        <h3 className={HEADING}>Order history</h3>
        <DataTable dense columns={ORDER_COLUMNS} rows={customer.orders} maxHeight={260} empty="No orders recorded." />
      </section>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="border-t border-hairline-soft pt-4"
      >
        <h3 className={HEADING}>Details</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField form={form} name="name" label="Name" />
          <FormField form={form} name="phone" label="Phone" type="tel" placeholder="Optional" />
          <FormField form={form} name="notes" label="Notes" as="textarea" rows={2} className="sm:col-span-2" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          {customer.orders.length ? (
            <p className="text-xs text-muted">Customers with orders are kept for history.</p>
          ) : (
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setConfirming(true)}>
              Delete customer
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" disabled={!dirty} loading={update.isPending}>
            Save changes
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={destroy}
        title="Delete customer?"
        message={`${customer.email} has no orders. The contact is removed for good.`}
        loading={remove.isPending}
      />
    </div>
  );
}

function CustomerDialog({ id, onClose }) {
  const [removing, setRemoving] = useState(false);
  const query = useItem('customers', id, { enabled: !removing });
  const c = query.data;

  function pauseWhileRemoving(on) {
    setRemoving(on);
    if (!on) query.refetch();
  }
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={c ? c.name || c.email : 'Customer'}
      description={c ? [c.name && c.email, c.phone].filter(Boolean).join(' · ') : undefined}
    >
      {query.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-14" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-44" />
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} compact />
      ) : (
        <CustomerBody key={c._id} customer={c} onClose={onClose} onRemoving={pauseWhileRemoving} />
      )}
    </Modal>
  );
}

export function CustomerModal({ open, ...props }) {
  return open ? <CustomerDialog {...props} /> : null;
}
