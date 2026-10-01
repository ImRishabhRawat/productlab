import { useState } from 'react';
import { ArrowRightLeft, Check, ChevronDown } from 'lucide-react';
import { LABELS, PRODUCT_STATUSES } from '@product-lab/shared/constants';
import { productUpdateSchema } from '@product-lab/shared/schemas';
import { Dot } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { FormField, Input } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Popover } from '../../components/ui/Popover.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useForm } from '../../lib/form.js';
import { useUpdate } from '../../lib/queries.js';
import { statusMeta } from '../../lib/status.js';

function KillDialog({ onClose, onKilled, product, reason }) {
  const toast = useToast();
  const form = useForm(() => ({ killReason: reason, learnings: product.learnings ?? '' }));
  const save = useUpdate('products');

  async function submit() {
    const killReason = form.values.killReason.trim();
    if (!killReason) return form.setErrors({ killReason: 'Say why, so the lesson is kept' });
    const body = form.validate(productUpdateSchema, { status: 'killed', statusNote: killReason.slice(0, 500), killReason, learnings: form.values.learnings });
    if (!body) return;
    try {
      await save.mutateAsync({ id: product._id, ...body });
      toast.success(`${product.name} moved to the graveyard`);
      onKilled();
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
      title="Kill this product?"
      description="It moves to the graveyard with its full history. Nothing is deleted and you can revive it later."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="danger" loading={save.isPending}>
            Kill product
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField form={form} name="killReason" label="Why kill it?" required as="textarea" rows={2} autoFocus placeholder="e.g. CAC stayed 2x above break-even after two tests" />
        <FormField form={form} name="learnings" label="What did you learn?" as="textarea" rows={3} placeholder="Kept in the graveyard so the lesson is not lost" />
      </div>
    </Modal>
  );
}

function KillModal({ open, ...props }) {
  return open ? <KillDialog {...props} /> : null;
}

export function ProductStatusMenu({ product }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [killing, setKilling] = useState(false);
  const save = useUpdate('products');

  const move = (status) =>
    save.mutate(
      { id: product._id, status, statusNote: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Moved to ${LABELS.status[status]}`);
          setNote('');
        },
        onError: (err) => toast.error(err),
      },
    );

  return (
    <>
      <Popover
        trigger={({ open, toggle }) => (
          <Button icon={ArrowRightLeft} loading={save.isPending} onClick={toggle} aria-expanded={open}>
            Change status
            <ChevronDown className="size-3.5 text-muted" aria-hidden />
          </Button>
        )}
      >
        {({ close }) => (
          <div className="w-64">
            <div className="border-b border-hairline-soft p-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Note for the history (optional)" aria-label="Status note" />
            </div>
            <ul className="p-1.5" aria-label="Move to">
              {PRODUCT_STATUSES.map((s) => {
                const current = s === product.status;
                return (
                  <li key={s}>
                    <button
                      type="button"
                      disabled={current}
                      onClick={() => {
                        close();
                        if (s === 'killed') setKilling(true);
                        else move(s);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink hover:bg-tint/70 disabled:hover:bg-transparent"
                    >
                      <Dot color={statusMeta('status', s).color} />
                      <span className="flex-1">{LABELS.status[s]}</span>
                      {current ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                          Current
                        </span>
                      ) : (
                        s === 'killed' && <span className="text-xs text-muted">Asks why</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Popover>
      <KillModal open={killing} onClose={() => setKilling(false)} onKilled={() => setNote('')} product={product} reason={note} />
    </>
  );
}
