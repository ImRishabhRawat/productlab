import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { LABELS } from '@product-lab/shared/constants';
import { convertIdeaSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { Field, FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { choices, currencySymbol } from '../../lib/format.js';
import { numberOrUndefined, useForm } from '../../lib/form.js';
import { useMutate } from '../../lib/queries.js';

const schema = convertIdeaSchema.required({ price: true });
const STARTS = choices(['ready_to_test', 'testing'], LABELS.status);

function ConvertDialog({ onClose, idea }) {
  const toast = useToast();
  const navigate = useNavigate();
  const priceRef = useRef(null);
  const form = useForm(() => ({ price: idea.expectedPrice == null ? '' : String(idea.expectedPrice), status: 'ready_to_test' }));
  const convert = useMutate((body) => api(`/ideas/${idea._id}/convert`, { method: 'POST', body }));

  useEffect(() => {
    priceRef.current?.focus();
    priceRef.current?.select();
  }, []);

  async function submit() {
    const body = form.validate(schema, { status: form.values.status, price: numberOrUndefined(form.values.price) });
    if (!body) return;
    try {
      const { product } = await convert.mutateAsync(body);
      toast.success(`${product.name} is now a product`);
      onClose();
      navigate(`/products/${product._id}`);
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
      title="Turn into product"
      description={idea.name}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={convert.isPending}>
            Create product
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField
          form={form}
          name="price"
          label="Launch price"
          required
          type="number"
          min="0"
          step="1"
          inputMode="decimal"
          prefix={currencySymbol()}
          hint={idea.expectedPrice == null ? undefined : 'Starts from the expected price'}
          ref={priceRef}
        />
        <Field label="Start as">
          <SegmentedControl label="Start as" options={STARTS} value={form.values.status} onChange={(v) => form.set('status', v)} />
        </Field>
        <p className="text-xs text-muted">
          Category, format, deliverable and target customer carry over. The idea stays linked as the product&apos;s origin.
        </p>
      </div>
    </Modal>
  );
}

export function ConvertIdeaModal({ open, ...props }) {
  return open ? <ConvertDialog {...props} /> : null;
}
