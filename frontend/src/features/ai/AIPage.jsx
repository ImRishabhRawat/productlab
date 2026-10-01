import { useRef, useState } from 'react';
import { ArrowUpRight, FlaskConical, Info, Lightbulb, Package, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { AI_KINDS, LABELS } from '@product-lab/shared/constants';
import { aiAnalyzeSchema } from '@product-lab/shared/schemas';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { FormField } from '../../components/ui/Field.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { choices, fmtDate, fmtDateTime, fmtRelative } from '../../lib/format.js';
import { useForm } from '../../lib/form.js';
import { useGet, useList, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { EvidenceGrid } from '../decisions/DecisionModal.jsx';
import { AiGenerating, AiNote, AnalysisView } from './AnalysisView.jsx';

const KIND_OPTIONS = choices(AI_KINDS, LABELS.aiKind);
const FILTERS = [{ value: 'all', label: 'All' }, ...KIND_OPTIONS];
const SOURCES = [
  { value: 'saved', label: 'Saved idea' },
  { value: 'text', label: 'New idea' },
];
const ICONS = { idea: Lightbulb, experiment: FlaskConical, product: Package };
const TARGETS = {
  idea: { resource: 'ideas', noun: 'an idea', plural: 'ideas', label: (i) => i.name },
  experiment: { resource: 'experiments', noun: 'an experiment', plural: 'experiments', label: (x) => `${x.name} · ${x.productName}` },
  product: { resource: 'products', noun: 'a product', plural: 'products', label: (p) => p.name },
};
const GUIDE = {
  idea: 'Audience, motivation, price range, ad angles, objections, risks and a validation checklist.',
  experiment: 'Unusual changes, the funnel bottleneck, strongest and weakest metrics, hypotheses and next steps.',
  product: 'Observation → hypothesis → next test, plus risks and opportunities.',
};
const WIDE = '(min-width: 1280px)';

function KindBadge({ kind }) {
  const Icon = ICONS[kind];
  return (
    <Badge>
      <Icon className="size-3" aria-hidden />
      {LABELS.aiKind[kind]}
    </Badge>
  );
}

function Runner({ enabled, run, onDone }) {
  const toast = useToast();
  const form = useForm(() => ({ kind: 'idea', source: 'saved', targetId: '', prompt: '' }));
  const { kind, source } = form.values;
  const target = TARGETS[kind];
  const typed = kind === 'idea' && source === 'text';
  const list = useList(target.resource, undefined, { enabled: !typed, placeholderData: undefined });
  const options = (list.data?.items ?? []).map((item) => ({ value: item._id, label: target.label(item) }));
  const placeholder = list.isPending ? 'Loading…' : options.length ? `Choose ${target.noun}` : `No ${target.plural} yet`;

  function change(patch) {
    form.setValues((v) => ({ ...v, ...patch, targetId: '' }));
    form.setErrors({});
  }

  function submit(e) {
    e.preventDefault();
    const body = form.validate(aiAnalyzeSchema, typed ? { kind, prompt: form.values.prompt } : { kind, targetId: form.values.targetId || undefined });
    if (!body) {
      if (typed) form.setErrors((errors) => ({ prompt: errors.prompt ?? 'Describe the idea' }));
      return;
    }
    run.mutate(
      { body, label: typed ? 'your idea' : options.find((o) => o.value === body.targetId)?.label },
      {
        onSuccess: (saved) => {
          toast.success('Analysis ready');
          onDone(saved);
        },
        onError: (err) => {
          form.serverErrors(err);
          toast.error(err);
        },
      },
    );
  }

  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <CardHeader title="New analysis" subtitle="Pick what to analyze. Results are saved to the history." className="mb-4" />
      {!enabled && (
        <p className="mb-4 flex gap-2 rounded-md bg-tint/60 p-3 text-[13px] text-body">
          <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <span>
            AI is off. Set <code className="rounded bg-canvas px-1 text-xs text-ink">GEMINI_API_KEY</code> on the server to turn it on.
          </span>
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <fieldset disabled={!enabled} className={`min-w-0 space-y-4 ${enabled ? '' : 'opacity-60'}`}>
          <SegmentedControl label="What to analyze" options={KIND_OPTIONS} value={kind} onChange={(k) => change({ kind: k })} />
          {kind === 'idea' && <SegmentedControl size="sm" label="Idea source" options={SOURCES} value={source} onChange={(s) => change({ source: s })} />}
          {typed ? (
            <FormField form={form} name="prompt" label="Describe the idea" as="textarea" rows={5} placeholder="Who it is for, what they get, the format and a rough price" />
          ) : (
            <FormField
              form={form}
              name="targetId"
              label={LABELS.aiKind[kind]}
              as="select"
              options={options}
              placeholder={placeholder}
              hint={list.error ? `Couldn't load ${target.plural}. ${list.error.message}` : undefined}
            />
          )}
          <Button type="submit" variant="primary" icon={Sparkles} loading={run.isPending} className="w-full justify-center">
            Run analysis
          </Button>
        </fieldset>
      </form>
    </Card>
  );
}

function HistoryList({ query, items, filter, onFilter, selectedId, onSelect, onDelete }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="p-4 pb-3 sm:px-5">
        <CardHeader title="History" subtitle={items.length ? `${items.length} saved ${items.length === 1 ? 'analysis' : 'analyses'}` : null} />
        <div className="mt-3">
          <SegmentedControl size="sm" label="Filter history" options={FILTERS} value={filter} onChange={onFilter} />
        </div>
      </div>
      {query.isPending ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.refetch} compact />
      ) : !items.length ? (
        <EmptyState compact title="Nothing saved yet." description="Analyses you run appear here." />
      ) : (
        <ul className="max-h-[34rem] overflow-y-auto border-t border-hairline-soft">
          {items.map((a) => {
            const active = a._id === selectedId;
            return (
              <li
                key={a._id}
                className={`flex items-center gap-1 border-b border-hairline-soft pr-2 last:border-0 ${
                  active ? 'bg-tint/50 shadow-[inset_2px_0_0_var(--color-accent)]' : 'hover:bg-tint/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(a._id)}
                  aria-current={active || undefined}
                  className="min-w-0 flex-1 px-4 py-2.5 text-left sm:px-5"
                >
                  <span className="block truncate text-[13px] font-medium text-ink">{a.title || 'Untitled analysis'}</span>
                  <span className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <KindBadge kind={a.kind} />
                    <time dateTime={a.createdAt} title={fmtDateTime(a.createdAt)}>
                      {fmtRelative(a.createdAt)}
                    </time>
                  </span>
                </button>
                <IconButton icon={Trash2} label="Delete analysis" size="icon-sm" onClick={() => onDelete(a)} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Context({ kind, input, loading }) {
  if (kind === 'idea') {
    if (!input?.idea?.description) return null;
    return (
      <section className="mt-5 rounded-lg bg-tint/60 p-4">
        <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Your idea</h3>
        <p className="text-[13px] leading-relaxed whitespace-pre-line text-body">{input.idea.description}</p>
      </section>
    );
  }
  return (
    <section className="mt-5 rounded-lg bg-tint/60 p-4">
      <h3 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">
        Data behind this analysis{input?.today ? ` · as of ${fmtDate(input.today, { year: true })}` : ''}
      </h3>
      <EvidenceGrid totals={input?.totals} loading={loading} />
    </section>
  );
}

function Detail({ analysis, full, loading, enabled, onRerun, onDelete }) {
  const input = full?.input;
  const rerun = analysis.targetId
    ? { kind: analysis.kind, targetId: analysis.targetId }
    : input?.idea?.description && { kind: 'idea', prompt: input.idea.description };
  return (
    <Card className="min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <KindBadge kind={analysis.kind} />
            <span>
              {fmtDateTime(analysis.createdAt)} · {analysis.model}
            </span>
          </div>
          <h2 className="mt-2 text-lg font-medium text-ink">{analysis.title || 'Untitled analysis'}</h2>
        </div>
        <div className="flex items-center gap-1.5">
          {analysis.targetId && (
            <ButtonLink to={`/${TARGETS[analysis.kind].resource}/${analysis.targetId}`} size="sm" variant="ghost" icon={ArrowUpRight}>
              Open {LABELS.aiKind[analysis.kind].toLowerCase()}
            </ButtonLink>
          )}
          {enabled && (
            <Button size="sm" icon={RefreshCw} disabled={!rerun} onClick={() => onRerun(rerun)}>
              Re-run
            </Button>
          )}
          <IconButton icon={Trash2} label="Delete analysis" size="icon-sm" onClick={onDelete} />
        </div>
      </div>
      <AiNote className="mt-3" />
      <Context kind={analysis.kind} input={input} loading={loading} />
      <div className="mt-6">
        <AnalysisView analysis={analysis} input={input} />
      </div>
    </Card>
  );
}

export default function AIPage() {
  const toast = useToast();
  const ai = useSettings().data?.ai;
  const enabled = Boolean(ai?.enabled);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [deleting, setDeleting] = useState(null);
  const detailRef = useRef(null);

  const history = useGet('/ai/analyses', { kind: filter === 'all' ? undefined : filter, limit: 100 });
  const run = useMutate(({ body }) => api('/ai/analyze', { method: 'POST', body }));
  const remove = useMutate((id) => api(`/ai/analyses/${id}`, { method: 'DELETE' }));
  const removed = remove.isPending || remove.isSuccess ? remove.variables : null;
  const items = (history.data?.items ?? []).filter((a) => a._id !== removed);
  const selectedId = params.get('id') ?? items[0]?._id ?? null;
  const detail = useGet(selectedId ? `/ai/analyses/${selectedId}` : null);
  const full = detail.data?._id === selectedId ? detail.data : null;
  const current = items.find((a) => a._id === selectedId) ?? full;

  function select(id, scroll = false) {
    setParams(id ? { id } : {}, { replace: true });
    if (scroll && !window.matchMedia(WIDE).matches) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function done(saved) {
    setFilter('all');
    select(saved._id);
  }

  function rerun(body) {
    run.mutate(
      { body, label: current?.title },
      {
        onSuccess: (saved) => {
          toast.success('Analysis ready');
          done(saved);
        },
        onError: (err) => toast.error(err),
      },
    );
  }

  async function confirmDelete() {
    const id = deleting._id;
    if (id === selectedId) select(items.find((a) => a._id !== id)?._id);
    try {
      await remove.mutateAsync(id);
      toast.success('Analysis deleted');
    } catch (err) {
      toast.error(err);
    }
    setDeleting(null);
  }

  let main;
  if (run.isPending) {
    main = (
      <Card className="p-4 sm:p-6">
        <AiGenerating label={run.variables?.label} />
      </Card>
    );
  } else if (current) {
    main = (
      <Detail
        analysis={current}
        full={full}
        loading={!full && !detail.error}
        enabled={enabled}
        onRerun={rerun}
        onDelete={() => setDeleting(current)}
      />
    );
  } else if (history.isPending || detail.isFetching) {
    main = (
      <Card className="p-4 sm:p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="mt-4 h-64" />
      </Card>
    );
  } else if (detail.error) {
    main = (
      <Card>
        {detail.error.status === 404 ? (
          <EmptyState
            title="Analysis not found."
            description="It may have been deleted."
            action={
              <Button size="sm" onClick={() => select(null)}>
                Show latest
              </Button>
            }
          />
        ) : (
          <ErrorState error={detail.error} onRetry={detail.refetch} />
        )}
      </Card>
    );
  } else {
    main = (
      <Card className="p-4 sm:p-6">
        <EmptyState
          compact
          icon={Sparkles}
          title="No analyses yet."
          description={
            enabled
              ? 'Pick an idea, experiment or product and run your first analysis.'
              : 'Results appear here once GEMINI_API_KEY is set on the server.'
          }
        />
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {Object.entries(GUIDE).map(([kind, text]) => (
            <li key={kind} className="rounded-md bg-tint/60 p-3">
              <KindBadge kind={kind} />
              <p className="mt-2 text-[13px] leading-relaxed text-body">{text}</p>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        title="AI Analysis"
        description="Hypotheses for ideas, experiments and products, built from your own numbers."
        meta={
          <StatusBadge kind="experimentStatus" value={enabled ? 'completed' : 'planned'} label={enabled ? `Connected · ${ai.model}` : 'Not configured'} />
        }
      />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-rows-[auto_1fr]">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
          <Runner enabled={enabled} run={run} onDone={done} />
        </div>
        <div ref={detailRef} className="min-w-0 scroll-mt-20 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          {main}
        </div>
        <div className="min-w-0 xl:sticky xl:top-6 xl:col-start-1 xl:row-start-2">
          <HistoryList
            query={history}
            items={items}
            filter={filter}
            onFilter={setFilter}
            selectedId={selectedId}
            onSelect={(id) => select(id, true)}
            onDelete={setDeleting}
          />
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete analysis?"
        message={`“${deleting?.title ?? ''}” is removed from the history. Your data is not affected.`}
        loading={remove.isPending}
      />
    </>
  );
}
