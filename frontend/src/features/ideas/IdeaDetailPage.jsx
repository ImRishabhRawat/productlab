import { useState } from 'react';
import { ArrowRight, Info, Lightbulb, Package, Pencil, Rocket } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { LABELS } from '@product-lab/shared/constants';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { DASH, fmtCurrency, fmtDate } from '../../lib/format.js';
import { useItem } from '../../lib/queries.js';
import { AIInsightPanel } from '../ai/AIInsightPanel.jsx';
import { ConvertIdeaModal } from './ConvertIdeaModal.jsx';
import { IdeaFormModal } from './IdeaFormModal.jsx';
import { Potential, SCORE_ROWS, ScoreList, STATUS_OPTIONS } from './IdeaScores.jsx';
import { AdsCard, CompetitorsCard, NotesCard, PriceCheck, SignalsCard, useSaveIdea } from './IdeaValidation.jsx';

const BACK = { to: '/ideas', label: 'Ideas' };
const PROFILE = [
  { key: 'targetCustomer', label: 'Target customer' },
  { key: 'format', label: 'Product format' },
  { key: 'problem', label: 'Problem or desire' },
  { key: 'deliverable', label: 'What the customer receives' },
  { key: 'source', label: 'Source' },
  { key: 'notes', label: 'Notes', wide: true },
];

function ScorePanel({ idea, onEdit }) {
  const { scores } = idea;
  const set = SCORE_ROWS.filter((r) => scores[r.key] != null).length;
  return (
    <Card className="flex min-w-0 flex-col p-4 sm:p-5 xl:col-span-2">
      <CardHeader
        title="Worth testing?"
        subtitle="Potential blends your five scores"
        className="mb-5"
        actions={
          <Button size="sm" variant="ghost" icon={Pencil} onClick={onEdit}>
            Adjust
          </Button>
        }
      />
      <Potential scores={scores} large />
      <div className="mt-6">
        <ScoreList scores={scores} />
      </div>
      <p className="mt-auto flex items-start gap-1.5 pt-5 text-xs text-muted">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          Internal decision aid from your own judgement, not a forecast. Risk counts inverted.
          {set < SCORE_ROWS.length && ` ${set} of ${SCORE_ROWS.length} scores set.`}
        </span>
      </p>
    </Card>
  );
}

function Profile({ idea }) {
  return (
    <Card className="min-w-0 p-4 sm:p-5 xl:col-span-2">
      <CardHeader title="About this idea" className="mb-4" />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {PROFILE.map((f) => (
          <div key={f.key} className={`min-w-0 ${f.wide ? 'sm:col-span-2' : ''}`}>
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className={`mt-0.5 text-[13px] break-words whitespace-pre-line ${idea[f.key] ? 'text-ink' : 'text-faint'}`}>{idea[f.key] || DASH}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function History({ history = [] }) {
  return (
    <Card className="min-w-0 p-4 sm:p-5">
      <CardHeader title="Status history" className="mb-4" />
      <ol className="space-y-3">
        {[...history].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
              {h.from ? <StatusBadge value={h.from} /> : 'Captured as'}
              {h.from && <ArrowRight className="size-3 text-faint" aria-hidden />}
              <StatusBadge value={h.to} />
            </span>
            <time dateTime={h.at} className="shrink-0 text-xs text-muted">
              {fmtDate(h.at, { year: true })}
            </time>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-4 w-14" />
      <Skeleton className="mb-2 h-9 w-96 max-w-full" />
      <Skeleton className="mb-6 h-4 w-64 max-w-full" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Skeleton className="h-96 xl:col-span-2" />
        <Skeleton className="h-96 xl:col-span-3" />
      </div>
    </div>
  );
}

export default function IdeaDetailPage() {
  const { id } = useParams();
  const query = useItem('ideas', id);
  const { save } = useSaveIdea(id);
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const idea = query.data;

  if (query.isPending) return <DetailSkeleton />;
  if (query.error) {
    return (
      <>
        <PageHeader back={BACK} title={query.error.status === 404 ? 'Idea not found' : 'Idea'} />
        <Card>
          {query.error.status === 404 ? (
            <EmptyState
              icon={Lightbulb}
              title="This idea does not exist."
              description="It may have been deleted, or the link is wrong."
              action={<ButtonLink to="/ideas">Back to ideas</ButtonLink>}
            />
          ) : (
            <ErrorState error={query.error} onRetry={query.refetch} />
          )}
        </Card>
      </>
    );
  }

  const converted = idea.status === 'converted';
  const facts = [idea.category, idea.expectedPrice != null && fmtCurrency(idea.expectedPrice), `Added ${fmtDate(idea.createdAt, { year: true })}`];
  const edit = () => setEditing(true);

  return (
    <>
      <PageHeader
        back={BACK}
        title={idea.name}
        meta={<StatusBadge value={idea.status} />}
        description={facts.filter(Boolean).join(' · ')}
        actions={
          converted ? (
            <>
              <Button icon={Pencil} onClick={edit}>
                Edit
              </Button>
              <ButtonLink to={`/products/${idea.productId}`} variant="primary" icon={Package}>
                Open product
              </ButtonLink>
            </>
          ) : (
            <>
              <SegmentedControl
                label="Status"
                options={STATUS_OPTIONS}
                value={idea.status}
                onChange={(status) => status !== idea.status && save({ status }, `Moved to ${LABELS.status[status]}`)}
              />
              <Button icon={Pencil} onClick={edit}>
                Edit
              </Button>
              <Button variant="primary" icon={Rocket} onClick={() => setConverting(true)}>
                Turn into product
              </Button>
            </>
          )
        }
      />

      {converted && idea.product && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-hairline bg-tint/50 px-4 py-3 text-[13px] text-body">
          <Package className="size-4 text-muted" aria-hidden />
          <span>Converted {fmtDate(idea.convertedAt, { year: true })} into</span>
          <Link to={`/products/${idea.product._id}`} className="font-medium text-ink hover:underline">
            {idea.product.name}
          </Link>
          <StatusBadge value={idea.product.status} />
          <span className="text-muted">at {fmtCurrency(idea.product.price)}</span>
        </div>
      )}

      <div key={idea._id}>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <ScorePanel idea={idea} onEdit={edit} />
          <SignalsCard idea={idea} className="xl:col-span-3" />
        </div>

        <Section title="Market evidence" description="What already exists, what it sells for and who buys it">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CompetitorsCard idea={idea} />
            <AdsCard idea={idea} />
            <PriceCheck idea={idea} className="lg:col-span-2" />
            <NotesCard idea={idea} className="lg:col-span-2" />
          </div>
        </Section>

        <Section title="Details">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Profile idea={idea} />
            <History history={idea.history} />
          </div>
        </Section>
      </div>

      <div className="mt-8">
        <AIInsightPanel kind="idea" targetId={id} />
      </div>

      <IdeaFormModal open={editing} onClose={() => setEditing(false)} idea={idea} />
      <ConvertIdeaModal open={converting} onClose={() => setConverting(false)} idea={idea} />
    </>
  );
}
