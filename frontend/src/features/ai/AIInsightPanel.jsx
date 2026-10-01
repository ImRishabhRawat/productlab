import { History, RefreshCw, Sparkles } from 'lucide-react';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { fmtRelative } from '../../lib/format.js';
import { useGet, useMutate } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { AiGenerating, AiNote, AnalysisView } from './AnalysisView.jsx';

const PURPOSE = {
  idea: 'Audience, pricing, ad angles and risks for this idea.',
  experiment: 'Unusual changes, bottlenecks and hypotheses for this test.',
  product: 'Observations, hypotheses and next tests for this product.',
};

export function AIInsightPanel({ kind, targetId }) {
  const toast = useToast();
  const enabled = Boolean(useSettings().data?.ai?.enabled);
  const query = useGet(targetId ? '/ai/analyses' : null, { kind, targetId, limit: 1 }, { placeholderData: undefined });
  const run = useMutate(() => api('/ai/analyze', { method: 'POST', body: { kind, targetId } }));
  const latest = query.data?.items[0];

  const analyze = () => run.mutate(undefined, { onSuccess: () => toast.success('AI analysis ready'), onError: (err) => toast.error(err) });
  const runButton = (label, icon) => (
    <Button size="sm" icon={icon} loading={run.isPending} onClick={analyze}>
      {label}
    </Button>
  );

  let body = null;
  if (run.isPending) body = <AiGenerating />;
  else if (query.isPending) body = <Skeleton className="h-40" />;
  else if (query.error) body = <ErrorState error={query.error} onRetry={query.refetch} compact />;
  else if (latest) body = <AnalysisView analysis={latest} />;
  else if (enabled) {
    body = (
      <EmptyState
        compact
        icon={Sparkles}
        title="No analysis yet."
        description="Built from this page's data. Takes up to a minute and is saved to the history."
        action={runButton('Run analysis', Sparkles)}
      />
    );
  }
  const off = !enabled && !latest && !body;

  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <CardHeader
        title={
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-4 text-accent" aria-hidden />
            AI analysis
          </span>
        }
        subtitle={
          latest
            ? `${fmtRelative(latest.createdAt)} · ${latest.model}${enabled ? '' : ' · AI is off'}`
            : off
              ? 'Off. Set GEMINI_API_KEY on the server to get hypotheses here. Everything else works without it.'
              : PURPOSE[kind]
        }
        actions={
          latest && (
            <>
              <ButtonLink to={`/ai?id=${latest._id}`} size="sm" variant="ghost" icon={History}>
                History
              </ButtonLink>
              {enabled && runButton('Re-run', RefreshCw)}
            </>
          )
        }
      />
      <AiNote className="mt-2" />
      {body && <div className="mt-4">{body}</div>}
    </Card>
  );
}
