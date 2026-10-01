import { useState } from 'react';
import { ChevronDown, FlaskConical, Link2, Package, Pencil, Plus, Target, X } from 'lucide-react';
import { Link } from 'react-router';
import { dailyOutcomeSchema } from '@product-lab/shared/schemas';
import { Button, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Checkbox, Input } from '../../components/ui/Field.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { useForm } from '../../lib/form.js';
import { CheckToggle } from './CheckToggle.jsx';
import { RefFields, refBody, refNames, refValues, useRefs } from './RefFields.jsx';
import { useSaveOutcome } from './useTodaySummary.js';

const MAX_TASKS = 10;
const LINKS = [
  { id: 'goalId', name: 'goalTitle', path: '/goals', icon: Target },
  { id: 'productId', name: 'productName', path: '/products', icon: Package },
  { id: 'experimentId', name: 'experimentName', path: '/experiments', icon: FlaskConical },
];

function TitleForm({ initial, onSave, onCancel }) {
  const [value, setValue] = useState(initial);
  const submit = (e) => {
    e.preventDefault();
    if (value.trim()) onSave(value.trim());
  };
  return (
    <form onSubmit={submit} className="mt-2">
      {!initial && <p className="mb-2 text-lg leading-snug font-semibold text-ink">What one result would make today a win?</p>}
      <div className="flex gap-2">
        <Input
          autoFocus={Boolean(initial)}
          value={value}
          maxLength={200}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onCancel?.()}
          placeholder="e.g. Launch Product #02 test"
          aria-label="Today's #1 outcome"
          className="min-w-0 flex-1"
        />
        <Button type="submit" variant="primary" disabled={!value.trim()}>
          {initial ? 'Save' : 'Set'}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function LinkChips({ outcome, onEdit }) {
  const chips = LINKS.filter((l) => outcome[l.id] && outcome[l.name]);
  const linked = LINKS.some((l) => outcome[l.id]);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-3">
      {chips.map(({ id, name, path, icon: Icon }) => (
        <Link
          key={id}
          to={`${path}/${outcome[id]}`}
          className="relative inline-flex max-w-full items-center gap-1 rounded-full bg-tint px-2.5 py-1 text-xs font-medium text-body hover:text-ink max-md:after:absolute max-md:after:-inset-y-2 max-md:after:inset-x-0"
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{outcome[name]}</span>
        </Link>
      ))}
      <button
        type="button"
        onClick={onEdit}
        className="relative inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs text-muted hover:bg-tint hover:text-ink max-md:after:absolute max-md:after:-inset-y-1 max-md:after:inset-x-0"
      >
        <Link2 className="size-3.5" aria-hidden />
        {linked ? 'Edit links' : 'Link a goal, product or experiment'}
      </button>
    </div>
  );
}

function LinkDialog({ onClose, outcome, onSave }) {
  const form = useForm(() => refValues(outcome));
  const refs = useRefs(form.values.productId);
  function submit() {
    const body = form.validate(dailyOutcomeSchema, refBody(form.values));
    if (!body) return;
    onSave({ ...body, names: refNames(body, refs) });
    onClose();
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Link outcome"
      description="Connect today's #1 outcome to the goal and work it moves forward."
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary">
            Save links
          </Button>
        </>
      }
    >
      <RefFields form={form} refs={refs} />
    </Modal>
  );
}

function LinkOutcomeModal({ open, ...props }) {
  return open ? <LinkDialog {...props} /> : null;
}

function Tasks({ tasks, onChange }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const done = tasks.filter((t) => t.done).length;
  const plain = (list) => list.map(({ title, done: d }) => ({ title, done: Boolean(d) }));
  const add = (e) => {
    e.preventDefault();
    if (!draft.trim() || tasks.length >= MAX_TASKS) return;
    onChange([...plain(tasks), { title: draft.trim(), done: false }]);
    setDraft('');
  };
  const toggle = (i) => onChange(plain(tasks).map((t, j) => (i === j ? { ...t, done: !t.done } : t)));
  const remove = (i) => onChange(plain(tasks).filter((_, j) => j !== i));

  return (
    <div className="mt-3 border-t border-hairline-soft pt-1 lg:mt-4 lg:pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between gap-2 text-[13px] font-medium text-body lg:hidden"
      >
        <span>
          Secondary tasks ({tasks.length}){tasks.length > 0 && <span className="font-normal text-muted"> · {done} done</span>}
        </span>
        <ChevronDown className={`size-4 text-muted transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      <p className="hidden py-1.5 text-[13px] font-medium text-body lg:block">
        Secondary tasks{tasks.length > 0 && <span className="font-normal text-muted"> · {done} of {tasks.length} done</span>}
      </p>
      <div className={`${open ? '' : 'hidden'} lg:block`}>
        {tasks.length > 0 && (
          <ul>
            {tasks.map((t, i) => (
              <li key={t._id ?? i} className="flex items-center gap-1">
                <Checkbox
                  checked={Boolean(t.done)}
                  onChange={() => toggle(i)}
                  label={<span className={`break-words ${t.done ? 'text-muted line-through' : ''}`}>{t.title}</span>}
                  className="min-w-0 flex-1 self-stretch"
                />
                <IconButton icon={X} label={`Remove ${t.title}`} className="text-faint" onClick={() => remove(i)} />
              </li>
            ))}
          </ul>
        )}
        {tasks.length < MAX_TASKS ? (
          <form onSubmit={add} className="mt-1.5 flex gap-2">
            <Input
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a supporting task"
              aria-label="New secondary task"
              className="min-w-0 flex-1"
            />
            <IconButton icon={Plus} label="Add task" type="submit" variant="secondary" disabled={!draft.trim()} />
          </form>
        ) : (
          <p className="mt-1.5 text-xs text-muted">Ten tasks is the limit. Keep the focus on the #1 outcome.</p>
        )}
      </div>
    </div>
  );
}

export function OutcomeCard({ outcome, date, className = '' }) {
  const save = useSaveOutcome(date);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const title = outcome?.title ?? '';
  const done = Boolean(outcome?.done);
  const tasks = outcome?.tasks ?? [];
  const update = (body) => save.mutate(body);

  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.06em] text-muted uppercase">Today&apos;s #1 outcome</h2>
        {title && !editing && <IconButton icon={Pencil} label="Edit #1 outcome" size="icon-sm" onClick={() => setEditing(true)} />}
      </div>
      {!title || editing ? (
        <TitleForm
          initial={title}
          onSave={(value) => {
            update({ title: value });
            setEditing(false);
          }}
          onCancel={title ? () => setEditing(false) : null}
        />
      ) : (
        <div className="mt-2 flex items-start gap-3">
          <CheckToggle large done={done} onToggle={() => update({ done: !done })} label="#1 outcome done" />
          <div className="min-w-0 flex-1 pt-1">
            <p className={`text-xl leading-snug font-semibold tracking-[-0.01em] break-words sm:text-2xl ${done ? 'text-body' : 'text-ink'}`}>{title}</p>
            {done && <p className="mt-0.5 text-[13px] font-medium text-positive">Done</p>}
            <LinkChips outcome={outcome} onEdit={() => setLinking(true)} />
          </div>
        </div>
      )}
      {(title || tasks.length > 0) && <Tasks tasks={tasks} onChange={(next) => update({ tasks: next })} />}
      <LinkOutcomeModal open={linking} onClose={() => setLinking(false)} outcome={outcome} onSave={update} />
    </Card>
  );
}
