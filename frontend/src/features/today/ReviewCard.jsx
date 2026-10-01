import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, CircleCheck, NotebookPen, Pencil } from 'lucide-react';
import { dailyReviewSchema } from '@product-lab/shared/schemas';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { fmtDate } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { useMutate } from '../../lib/queries.js';
import { TODAY_KEY } from './useTodaySummary.js';

const FIELDS = [
  { name: 'accomplishment', label: 'Biggest accomplishment', placeholder: 'What moved forward?' },
  { name: 'lesson', label: 'Biggest lesson', placeholder: 'What would you do differently?' },
  { name: 'blocker', label: 'Blocker', placeholder: 'What slowed you down?' },
  { name: 'tomorrowOutcome', label: 'Tomorrow’s #1 outcome', placeholder: 'The one result for tomorrow', maxLength: 200 },
];

function reviewSummary(review, outcome) {
  const status = outcome?.title ? (outcome.done ? '#1 outcome done' : '#1 outcome not done') : null;
  return [status, review.tomorrowOutcome && `Tomorrow: ${review.tomorrowOutcome}`].filter(Boolean).join(' · ') || 'Answers saved';
}

function ReviewForm({ date, label, review, outcome, onDirty, onSaved }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [day] = useState(date);
  const [snapshot] = useState(outcome);
  const live = outcome === undefined ? snapshot : outcome;
  const hasOutcome = Boolean(live?.title);
  const form = useForm(() => ({
    outcomeCompleted: undefined,
    ...Object.fromEntries(FIELDS.map((f) => [f.name, review?.[f.name] ?? ''])),
  }));
  const save = useMutate((body) => api(`/reviews/daily/${day}`, { method: 'PUT', body }));
  const picked = form.values.outcomeCompleted;
  const answer = picked === undefined ? Boolean(live?.done) : picked;

  async function submit(e) {
    e.preventDefault();
    const body = form.validate(dailyReviewSchema, {
      ...(hasOutcome && picked !== undefined && { outcomeCompleted: picked }),
      ...Object.fromEntries(FIELDS.map((f) => [f.name, form.values[f.name].trim()])),
    });
    if (!body) return;
    try {
      const saved = await save.mutateAsync(body);
      const setDone = (o) => (o && typeof body.outcomeCompleted === 'boolean' ? { ...o, done: body.outcomeCompleted } : o);
      queryClient.setQueryData(TODAY_KEY, (d) => (d?.date === day ? { ...d, review: saved, outcome: setDone(d.outcome) } : d));
      queryClient.setQueryData(['get', `/reviews/daily/${day}`, {}], saved);
      queryClient.setQueryData(['get', `/daily-outcomes/${day}`, {}], setDone);
      toast.success(`${label ?? 'Day'} reviewed${body.tomorrowOutcome ? ' · tomorrow’s #1 outcome set' : ''}`);
      onSaved();
    } catch (err) {
      form.serverErrors(err);
      toast.error(err);
    }
  }

  return (
    <form onSubmit={submit} onChange={onDirty} noValidate className="space-y-4">
      {hasOutcome && (
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-body">
            Did you complete <span className="text-ink">{live.title}</span>?
          </legend>
          <div className="grid max-w-xs grid-cols-2 gap-2">
            {[true, false].map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-pressed={answer === value}
                onClick={() => {
                  form.set('outcomeCompleted', answer === value ? null : value);
                  onDirty();
                }}
                className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                  answer === value ? 'border-ink/40 bg-tint-strong text-ink' : 'border-hairline bg-canvas text-body hover:bg-tint'
                }`}
              >
                {value ? 'Yes' : 'No'}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <FormField key={f.name} form={form} name={f.name} label={f.label} placeholder={f.placeholder} maxLength={f.maxLength ?? 500} />
        ))}
      </div>
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={save.isPending} className="w-full justify-center sm:w-auto">
          Save review
        </Button>
      </div>
    </form>
  );
}

export function ReviewCard({ date, today, review, outcome, error, onRetry, open, edit, onChange, className = '', cardRef }) {
  const label = date === today ? null : fmtDate(date, { weekday: true });
  const loaded = review !== undefined && outcome !== undefined;
  const showForm = edit === true || (loaded && (review ? edit === 'link' && !review.tomorrowOutcome : open));
  const title = label ? `Review ${label}` : 'Review your day';

  let body;
  if (showForm) {
    body = (
      <div className="p-4 sm:p-5">
        <CardHeader
          title={title}
          subtitle="Short answers, not a journal"
          actions={<IconButton icon={ChevronUp} label="Collapse review" aria-expanded onClick={() => onChange({ open: false, edit: false, dirty: false })} />}
          className="mb-4"
        />
        <ReviewForm
          key={date}
          date={date}
          label={label}
          review={review}
          outcome={outcome}
          onDirty={() => onChange({ open: true, edit: true, dirty: true })}
          onSaved={() => onChange(null)}
        />
      </div>
    );
  } else if (error) {
    body = <ErrorState compact error={error} onRetry={onRetry} />;
  } else if (!loaded) {
    body = <Skeleton className="m-4 h-10 sm:m-5" />;
  } else if (review) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <CircleCheck className="mt-0.5 size-5 shrink-0 fill-positive text-canvas" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-[15px] font-medium text-ink">{label ? `${label} reviewed` : 'Day reviewed'}</h2>
            <p className="mt-0.5 text-[13px] break-words text-muted">{reviewSummary(review, outcome)}</p>
          </div>
        </div>
        <Button size="sm" icon={Pencil} onClick={() => onChange({ open: true, edit: true })}>
          Edit
        </Button>
      </div>
    );
  } else {
    body = (
      <button type="button" onClick={() => onChange({ open: true })} aria-expanded={false} className="flex min-h-16 w-full items-center gap-3 p-4 text-left sm:px-5">
        <NotebookPen className="size-5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-ink">{title}</span>
          <span className="block text-[13px] text-muted">Five quick answers to close the day</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>
    );
  }

  return (
    <Card ref={cardRef} id="review" className={`scroll-mt-20 ${className}`}>
      {body}
    </Card>
  );
}
