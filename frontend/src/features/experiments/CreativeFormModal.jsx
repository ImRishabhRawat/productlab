import { CREATIVE_FORMATS, LABELS } from '@product-lab/shared/constants';
import { creativeSchema, creativeUpdateSchema } from '@product-lab/shared/schemas';
import { Button } from '../../components/ui/Button.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { useDateRange } from '../../lib/dateRange.jsx';
import { choices } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { useMutate } from '../../lib/queries.js';

const FIELDS = ['name', 'hook', 'format', 'angle', 'campaign', 'adSet', 'url', 'notes'];
const FORMAT_OPTIONS = choices(CREATIVE_FORMATS, LABELS.creativeFormat);

function CreativeDialog({ onClose, experimentId, creative }) {
  const { today } = useDateRange();
  const toast = useToast();
  const form = useForm(() => ({
    ...Object.fromEntries(FIELDS.map((k) => [k, creative?.[k] ?? ''])),
    startDate: creative ? (creative.startDate ?? '') : today,
  }));
  const save = useMutate((body) =>
    creative ? api(`/creatives/${creative._id}`, { method: 'PATCH', body }) : api('/creatives', { method: 'POST', body }),
  );

  async function submit() {
    const body = { ...form.values, format: form.values.format || undefined, startDate: form.values.startDate || null };
    const valid = creative ? form.validate(creativeUpdateSchema, body) : form.validate(creativeSchema, { ...body, experimentId });
    if (!valid) return;
    try {
      await save.mutateAsync(valid);
      toast.success(creative ? 'Creative updated' : 'Creative added');
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
      title={creative ? 'Edit creative' : 'Add creative'}
      description="Its results come from metric entries tagged with this creative."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {creative ? 'Save changes' : 'Add creative'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField form={form} name="name" label="Name" required placeholder="Creative A · UGC testimonial" autoFocus className="sm:col-span-2" />
        <FormField form={form} name="hook" label="Hook" as="textarea" rows={2} placeholder="The opening line or first three seconds" className="sm:col-span-2" />
        <FormField form={form} name="format" label="Format" as="select" placeholder="Choose a format" options={FORMAT_OPTIONS} />
        <FormField form={form} name="angle" label="Angle" placeholder="e.g. Social proof" />
        <FormField form={form} name="campaign" label="Campaign" placeholder="Defaults to the experiment's campaign" />
        <FormField form={form} name="adSet" label="Ad set" placeholder="e.g. Broad · 1" />
        <FormField form={form} name="startDate" label="Start date" type="date" />
        <FormField form={form} name="url" label="Link" type="url" placeholder="Ad preview or asset URL" />
        <FormField form={form} name="notes" label="Notes" as="textarea" rows={2} className="sm:col-span-2" />
      </div>
    </Modal>
  );
}

export function CreativeFormModal({ open, ...props }) {
  return open ? <CreativeDialog {...props} /> : null;
}
