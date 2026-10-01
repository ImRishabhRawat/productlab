import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, Play, Timer } from 'lucide-react';
import { BLOCK_CATEGORIES, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { focusStartSchema } from '@product-lab/shared/schemas';
import { ProgressRing } from '../../components/charts/ProgressRing.jsx';
import { METRIC_COLORS } from '../../components/charts/palette.js';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ConfirmDialog, Modal } from '../../components/ui/Modal.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { choices, fmtDuration } from '../../lib/format.js';
import { numberOrUndefined, useForm } from '../../lib/form.js';
import { useMutate } from '../../lib/queries.js';
import { useNow } from '../../lib/useNow.js';
import { RefFields, refBody, refValues, useRefs } from './RefFields.jsx';
import { TODAY_KEY } from './useTodaySummary.js';

const PRESETS = [25, 50, 90];
const CATEGORY_OPTIONS = choices(BLOCK_CATEGORIES, PRODUCTIVITY_LABELS.blockCategory);

const clockText = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

function StartFocusDialog({ onClose, defaults }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const form = useForm(() => ({ plannedMinutes: '50', label: '', category: defaults.category, ...refValues(defaults) }));
  const refs = useRefs(form.values.productId);
  const start = useMutate((body) => api('/focus-sessions', { method: 'POST', body }));
  const minutes = form.values.plannedMinutes;

  async function submit() {
    const v = form.values;
    const body = form.validate(focusStartSchema, {
      plannedMinutes: numberOrUndefined(minutes),
      label: v.label.trim(),
      category: v.category,
      ...refBody(v),
    });
    if (!body) return;
    try {
      await start.mutateAsync(body);
      toast.success(`Focus started · ${fmtDuration(body.plannedMinutes)}`);
      onClose();
    } catch (err) {
      if (err.status === 409) {
        toast.error('A focus session is already running. Showing it now.');
        queryClient.invalidateQueries({ queryKey: TODAY_KEY });
        onClose();
        return;
      }
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Start focus"
      description="One block of deep work, logged when you finish."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Play} loading={start.isPending}>
            Start
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-body">Duration</legend>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)] items-start gap-2">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={String(m) === minutes}
                data-autofocus={String(m) === minutes || undefined}
                onClick={() => form.set('plannedMinutes', String(m))}
                className={`h-10 rounded-md border text-sm font-medium transition-colors md:h-9 ${
                  String(m) === minutes ? 'border-primary bg-primary/10 text-ink' : 'border-hairline bg-canvas text-body hover:bg-tint'
                }`}
              >
                {m}m
              </button>
            ))}
            <FormField
              form={form}
              name="plannedMinutes"
              type="number"
              inputMode="numeric"
              min="5"
              max="240"
              step="1"
              suffix="min"
              aria-label="Minutes (5 to 240)"
              className="[&_input]:[appearance:textfield] [&_input::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        </fieldset>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField form={form} name="label" label="Working on" placeholder="Landing page" maxLength={120} />
          <FormField form={form} name="category" label="Category" as="select" options={CATEGORY_OPTIONS} />
        </div>
        <RefFields form={form} refs={refs} />
      </div>
    </Modal>
  );
}

export function StartFocusModal({ open, ...props }) {
  return open ? <StartFocusDialog {...props} /> : null;
}

function RunningFocus({ session, onFinish, pending }) {
  const now = useNow(1000);
  const total = session.plannedMinutes * 60;
  const elapsed = Math.max(Math.floor((now - new Date(session.startedAt).getTime()) / 1000), 0);
  const left = Math.max(total - elapsed, 0);
  const up = left === 0;
  const context = [session.productName, session.experimentName, session.goalTitle].filter(Boolean).join(' · ');

  return (
    <div className="mt-4">
      <div className="flex items-center gap-4">
        <ProgressRing value={(Math.min(elapsed, total) / total) * 100} size={104} stroke={8} color={METRIC_COLORS.focus} label="Focus session progress">
          <span className="text-xl leading-none font-semibold text-ink tabular-nums">{clockText(left)}</span>
          <span className="mt-1 text-[11px] text-muted">of {fmtDuration(session.plannedMinutes)}</span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          {up && <p className="text-base font-semibold text-ink">Time&apos;s up</p>}
          <p className="truncate text-[15px] font-medium text-ink">{session.label || 'Focus session'}</p>
          <p className="truncate text-[13px] text-muted">{context || PRODUCTIVITY_LABELS.blockCategory[session.category]}</p>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Button
          variant={up ? 'primary' : 'secondary'}
          icon={CircleCheck}
          loading={pending === 'completed'}
          onClick={() => onFinish('completed')}
          className="flex-1 justify-center"
        >
          {up ? 'Complete session' : 'Complete'}
        </Button>
        <Button variant="ghost" disabled={Boolean(pending)} onClick={() => onFinish('cancelled')}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function FocusCard({ focus, onStart, className = '' }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const running = focus.running;
  const finish = useMutate((status) => api(`/focus-sessions/${running._id}`, { method: 'PATCH', body: { status } }), {
    onSuccess: (s) => toast.success(s.status === 'completed' ? `Focus logged · ${fmtDuration(s.minutes)}` : 'Focus session cancelled'),
    onError: (err) => {
      toast.error(err);
      queryClient.invalidateQueries({ queryKey: TODAY_KEY });
    },
  });
  const onFinish = (status) => (status === 'cancelled' ? setConfirming(true) : finish.mutate(status));

  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Focus"
        subtitle={focus.minutesToday ? `${fmtDuration(focus.minutesToday)} focused today` : 'No focus time yet today'}
        actions={running && <span className="text-xs font-medium text-muted">Running</span>}
      />
      {running ? (
        <RunningFocus session={running} onFinish={onFinish} pending={finish.isPending && finish.variables} />
      ) : (
        <Button icon={Timer} className="mt-4 w-full justify-center sm:w-auto" onClick={onStart}>
          Start focus
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          finish.mutate('cancelled');
        }}
        title="Stop without logging?"
        message="This session is marked cancelled and won't count toward today's focus time."
        confirmLabel="Stop without logging"
      />
    </Card>
  );
}
