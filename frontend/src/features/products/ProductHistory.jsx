import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Link } from 'react-router';
import { productEventSchema, versionSchema } from '@product-lab/shared/schemas';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EventIcon } from '../../components/ui/EventIcon.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { currencySymbol, fmtCurrency, fmtDate } from '../../lib/format.js';
import { numberOrNull, useForm } from '../../lib/form.js';
import { useGet, useMutate } from '../../lib/queries.js';
import { DecisionList } from '../decisions/DecisionList.jsx';

const EXPERIMENT_EVENTS = ['experiment', 'experiment_end', 'creative'];

function eventHref(e) {
  if (e.type === 'idea' && e.refId) return `/ideas/${e.refId}`;
  if (EXPERIMENT_EVENTS.includes(e.type) && e.refId) return `/experiments/${e.refId}`;
  return null;
}

function nextVersion(label) {
  const match = /^v(\d+)$/i.exec(label ?? '');
  return match ? `v${Number(match[1]) + 1}` : '';
}

function Timeline({ items, year, onDelete }) {
  return (
    <ol>
      {items.map((e, i) => {
        const href = eventHref(e);
        const prev = items[i - 1];
        const echo = e.type === 'status' && prev?.type === 'decision' && prev.date === e.date && prev.note === e.note;
        const sameDay = prev?.date === e.date;
        return (
          <li key={e._id ?? `${e.type}-${e.refId ?? ''}-${e.date}-${i}`} className="flex gap-3">
            <time dateTime={e.date} className="w-14 shrink-0 pt-1.5 text-right text-xs whitespace-nowrap text-muted tabular-nums">
              <span className={sameDay ? 'sr-only' : ''}>{fmtDate(e.date)}</span>
              {!sameDay && e.date.slice(0, 4) !== year && <span className="block text-faint">{e.date.slice(0, 4)}</span>}
            </time>
            <div className="flex flex-col items-center">
              <EventIcon event={e} />
              {i < items.length - 1 && <span className="w-px flex-1 bg-hairline" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1 pt-1 pb-4">
              <p className="text-[13px] text-ink">
                {href ? (
                  <Link to={href} className="hover:underline">
                    {e.title}
                  </Link>
                ) : (
                  e.title
                )}
                {e.type === 'price' && (
                  <span className="font-medium">
                    {' '}
                    {fmtCurrency(e.from)} → {fmtCurrency(e.to)}
                  </span>
                )}
                {e.type === 'version' && typeof e.to === 'number' && <span className="text-muted"> · {fmtCurrency(e.to)}</span>}
              </p>
              {e.note && !echo && <p className="mt-0.5 text-xs text-muted">{e.note}</p>}
            </div>
            {e.type === 'milestone' && e._id && <IconButton icon={X} label={`Delete milestone ${e.title}`} size="icon-sm" onClick={() => onDelete(e)} />}
          </li>
        );
      })}
    </ol>
  );
}

function MilestoneForm({ productId }) {
  const { today } = useDateRange();
  const toast = useToast();
  const form = useForm(() => ({ date: today, title: '' }));
  const add = useMutate((body) => api(`/products/${productId}/events`, { method: 'POST', body }));

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(productEventSchema, form.values);
    if (!body) return;
    try {
      await add.mutateAsync(body);
      toast.success('Milestone added');
      form.setValues({ date: today, title: '' });
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mb-5 flex flex-wrap items-start gap-2 rounded-lg bg-tint/60 p-2.5">
      <FormField form={form} name="date" type="date" aria-label="Milestone date" className="w-40" />
      <FormField form={form} name="title" aria-label="Milestone" placeholder="Add a milestone, e.g. Upsell added" className="min-w-48 flex-1" />
      <Button type="submit" variant="primary" icon={Plus} loading={add.isPending}>
        Add
      </Button>
    </form>
  );
}

function VersionDialog({ onClose, product }) {
  const { today } = useDateRange();
  const toast = useToast();
  const form = useForm(() => ({ label: nextVersion(product.version), date: today, price: String(product.price ?? ''), changes: '' }));
  const save = useMutate((body) => api(`/products/${product._id}/versions`, { method: 'POST', body }));

  async function submit() {
    const body = form.validate(versionSchema, { ...form.values, price: numberOrNull(form.values.price) });
    if (!body) return;
    try {
      await save.mutateAsync(body);
      toast.success(`Version ${body.label} added`);
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
      size="sm"
      title="Add version"
      description="Becomes the current version. A new price is logged as a price change."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Add version
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField form={form} name="label" label="Version" required autoFocus placeholder="v3" />
          <FormField form={form} name="date" label="Release date" type="date" required />
          <FormField form={form} name="price" label="Price" type="number" min="0" step="0.01" inputMode="decimal" prefix={currencySymbol()} />
        </div>
        <FormField form={form} name="changes" label="What changed" as="textarea" rows={3} placeholder="e.g. 150 videos, HD exports, captions" />
      </div>
    </Modal>
  );
}

function VersionModal({ open, ...props }) {
  return open ? <VersionDialog {...props} /> : null;
}

function Versions({ product, query, onAdd }) {
  const items = query.data?.items ?? [];
  return (
    <Card className="p-4 sm:p-5">
      <CardHeader
        title="Versions"
        subtitle="Releases and their prices"
        className="mb-4"
        actions={
          <Button size="sm" icon={Plus} onClick={onAdd}>
            Add version
          </Button>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-24" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} compact />
      ) : !items.length ? (
        <EmptyState compact title="No versions yet." description="Log a release whenever the offer changes." />
      ) : (
        <ol className="space-y-3">
          {items.map((v) => (
            <li key={v._id} className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3">
              <span className="text-[13px] font-semibold text-ink">{v.label}</span>
              <span className="truncate text-[13px] text-body">
                {fmtCurrency(v.price)}
                {v.label === product.version && <span className="text-muted"> · current</span>}
              </span>
              <time dateTime={v.date} className="text-xs text-muted">
                {fmtDate(v.date, { year: true })}
              </time>
              {v.changes && <p className="col-span-2 col-start-2 mt-0.5 text-xs text-muted">{v.changes}</p>}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function ProductHistory({ product, decisions, onDecide }) {
  const { today } = useDateRange();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);
  const timeline = useGet(`/products/${product._id}/timeline`);
  const versions = useGet(`/products/${product._id}/versions`);
  const remove = useMutate((eventId) => api(`/products/${product._id}/events/${eventId}`, { method: 'DELETE' }));
  const items = timeline.data?.items ?? [];

  async function confirmRemove() {
    try {
      await remove.mutateAsync(removing._id);
      toast.success('Milestone deleted');
      setRemoving(null);
    } catch (err) {
      toast.error(err);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="min-w-0 p-4 sm:p-5 lg:col-span-2">
        <CardHeader title="Timeline" subtitle={timeline.data ? `${items.length} events, oldest first` : 'Every change, oldest first'} className="mb-4" />
        <MilestoneForm productId={product._id} />
        {timeline.isPending ? (
          <Skeleton className="h-96" />
        ) : timeline.error ? (
          <ErrorState error={timeline.error} onRetry={timeline.refetch} compact />
        ) : !items.length ? (
          <EmptyState compact title="No history yet." description="Milestones, experiments and decisions appear here." />
        ) : (
          <Timeline items={items} year={today.slice(0, 4)} onDelete={setRemoving} />
        )}
      </Card>
      <div className="min-w-0 space-y-4">
        <Versions product={product} query={versions} onAdd={() => setAdding(true)} />
        <Card className="p-4 sm:p-5">
          <CardHeader title="Decisions" subtitle="Each call with the evidence at the time" className="mb-4" />
          <DecisionList query={decisions} onRecord={onDecide} />
        </Card>
      </div>
      <VersionModal open={adding} onClose={() => setAdding(false)} product={product} />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        loading={remove.isPending}
        title="Delete milestone?"
        message={`“${removing?.title}” will be removed from the timeline. Other history stays.`}
      />
    </div>
  );
}
