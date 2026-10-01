import { useState } from 'react';
import { Lightbulb, Plus, Rocket, SearchX, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { LABELS, LEVELS } from '@product-lab/shared/constants';
import { percent } from '@product-lab/shared/metrics';
import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { MUTED, SERIES } from '../../components/charts/palette.js';
import { ScatterPlot } from '../../components/charts/ScatterPlot.jsx';
import { Badge, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Stat } from '../../components/ui/Card.jsx';
import { Select } from '../../components/ui/Field.jsx';
import { FilterBar, PageHeader } from '../../components/ui/PageHeader.jsx';
import { SearchInput } from '../../components/ui/SearchInput.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { DASH, fmtCurrency, fmtPercent, fmtRelative } from '../../lib/format.js';
import { useList } from '../../lib/queries.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { ConvertIdeaModal } from './ConvertIdeaModal.jsx';
import { IdeaFormModal } from './IdeaFormModal.jsx';
import { OPEN_STATUSES, Potential, ScoreList } from './IdeaScores.jsx';

const TABS = [...OPEN_STATUSES, 'converted', 'killed'];
const FILTERS = ['q', 'status', 'category', 'potential', 'difficulty', 'risk'];
const LEVEL_FILTERS = [
  { key: 'potential', label: 'Potential', noun: 'potential', width: 'sm:w-40' },
  { key: 'difficulty', label: 'Effort', noun: 'effort', width: 'sm:w-36' },
  { key: 'risk', label: 'Risk', noun: 'risk', width: 'sm:w-32' },
];
const SORTS = [
  { value: '', label: 'Newest' },
  { value: '-potential', label: 'Highest potential' },
  { value: '-expectedPrice', label: 'Highest price' },
];
const HALF = 'w-[calc(50%-0.25rem)]';
const isOpen = (i) => OPEN_STATUSES.includes(i.status);

function PipelineStats({ ideas, counts }) {
  const open = ideas.filter(isOpen);
  const potentials = open.map((i) => i.scores.potential).filter((v) => v != null);
  const average = potentials.length ? Math.round(potentials.reduce((a, b) => a + b, 0) / potentials.length) : null;
  const stats = [
    { label: 'In pipeline', value: open.length, sub: 'Idea, researching or ready' },
    { label: 'Ready to test', value: counts.ready_to_test, sub: 'Next in line for an ad test' },
    { label: 'Average potential', value: average ?? DASH, sub: 'Internal 0–100 score, open ideas' },
    { label: 'Converted', value: counts.converted, sub: `${fmtPercent(percent(counts.converted, ideas.length), 0)} of ideas became products` },
  ];
  return (
    <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-4 sm:p-5 lg:grid-cols-1 lg:content-between lg:gap-0 lg:divide-y lg:divide-hairline-soft">
      {stats.map((s) => (
        <Stat key={s.label} {...s} className="lg:py-3 lg:first:pt-0 lg:last:pb-0" />
      ))}
    </Card>
  );
}

function quickWinNote(wins) {
  const [top] = wins;
  if (!top) return 'No open idea pairs high potential with low effort yet.';
  if (wins.length === 1) return `Quick win: ${top.name}, potential ${top.potential} at effort ${top.effort}.`;
  return `${wins.length} quick wins, led by ${top.name} at potential ${top.potential}.`;
}

function EffortChart({ ideas }) {
  const points = ideas
    .filter((i) => isOpen(i) && i.effort != null && i.scores.potential != null)
    .map((i) => ({
      _id: i._id,
      name: i.name,
      status: i.status,
      effort: i.effort,
      potential: i.scores.potential,
      quick: i.scores.potentialLevel === 'high' && i.scores.difficultyLevel === 'low',
    }));
  const wins = points.filter((p) => p.quick).sort((a, b) => b.potential - a.potential);
  return (
    <ChartCard
      className="lg:col-span-2"
      title="Potential vs effort"
      subtitle="Open ideas. Quick wins, high potential for low effort, are highlighted."
      height={260}
      empty={!points.length}
      emptyMessage="Score effort on an open idea to place it here."
      insight={quickWinNote(wins)}
      table={{
        columns: [
          { key: 'name', header: 'Idea' },
          { key: 'status', header: 'Status', format: (v) => LABELS.status[v] },
          { key: 'effort', header: 'Effort', align: 'right' },
          { key: 'potential', header: 'Potential', align: 'right' },
          { key: 'quick', header: 'Quick win', format: (v) => (v ? 'Yes' : 'No') },
        ],
        rows: points,
      }}
    >
      <ScatterPlot
        data={points}
        labelCount={1}
        colorFor={wins.length ? (p) => (p.quick ? SERIES[0] : MUTED) : undefined}
        labelFor={wins.length ? (p) => p.quick : undefined}
        x={{ key: 'effort', label: 'Effort (0–10)', format: 'number', domain: [0, 10], ticks: [0, 2, 4, 6, 8, 10] }}
        y={{ key: 'potential', label: 'Potential', format: 'number', domain: [0, 100], ticks: [0, 25, 50, 75, 100] }}
        extraRows={(p) => [{ label: 'Status', value: LABELS.status[p.status] }]}
      />
    </ChartCard>
  );
}

function IdeaCard({ idea, onConvert }) {
  const { scores } = idea;
  return (
    <Card as="article" className="group relative flex min-w-0 flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-[15px] leading-snug font-medium text-ink">
          <Link to={`/ideas/${idea._id}`} className="line-clamp-2 after:absolute after:inset-0 after:rounded-lg group-hover:underline">
            {idea.name}
          </Link>
        </h3>
        <StatusBadge value={idea.status} />
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        {idea.category && <Badge>{idea.category}</Badge>}
        {idea.expectedPrice != null && <span className="font-medium text-ink">{fmtCurrency(idea.expectedPrice)}</span>}
        {idea.format && <span className="min-w-0 truncate">{idea.format}</span>}
      </div>
      {idea.targetCustomer && (
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-muted">
          <Users className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{idea.targetCustomer}</span>
        </p>
      )}
      <div className="mt-auto pt-5">
        <Potential scores={scores} />
        <div className="mt-4">
          <ScoreList scores={scores} compact />
        </div>
      </div>
      <div className="mt-4 flex min-h-8 items-center justify-between gap-2 border-t border-hairline-soft pt-3">
        {scores.riskLevel ? (
          <StatusBadge kind="level" value={scores.riskLevel} label={`${LABELS.level[scores.riskLevel]} risk`} />
        ) : (
          <Badge>Risk not scored</Badge>
        )}
        {idea.status === 'ready_to_test' ? (
          <Button size="sm" variant="ghost" icon={Rocket} className="relative z-10 -my-1.5 -mr-2" onClick={() => onConvert(idea)}>
            Turn into product
          </Button>
        ) : idea.status === 'converted' && idea.productId ? (
          <Link to={`/products/${idea.productId}`} className="relative z-10 text-xs font-medium text-muted hover:text-ink hover:underline">
            Open product
          </Link>
        ) : (
          <span className="truncate text-xs text-muted">Added {fmtRelative(idea.createdAt)}</span>
        )}
      </div>
    </Card>
  );
}

export default function IdeasPage() {
  const navigate = useNavigate();
  const { get: param, set: setParam, clear } = useSearchParamState();
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState(null);
  const status = TABS.includes(param('status')) ? param('status') : '';
  const sort = SORTS.some((s) => s.value === param('sort')) ? param('sort') : '';
  const list = useList('ideas', {
    q: param('q') || undefined,
    category: param('category') || undefined,
    ...Object.fromEntries(LEVEL_FILTERS.map(({ key }) => [key, LEVELS.includes(param(key)) ? param(key) : undefined])),
    sort: sort || undefined,
  });

  const scope = list.data?.items ?? [];
  const counts = Object.fromEntries(TABS.map((s) => [s, scope.filter((i) => i.status === s).length]));
  const visible = status ? scope.filter((i) => i.status === status) : scope;
  const filtered = FILTERS.some((k) => param(k));
  const onlyStatus = FILTERS.every((k) => k === 'status' || !param(k));
  const clearFilters = () => clear(['sort']);

  return (
    <>
      <PageHeader
        title="Ideas"
        description={list.data && `${visible.length} ${visible.length === 1 ? 'idea' : 'ideas'}${filtered ? ' shown' : ''}`}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New idea
          </Button>
        }
      />
      <FilterBar>
        <Tabs
          label="Status"
          className="w-full"
          value={status}
          onChange={(v) => setParam('status', v)}
          tabs={[
            { value: '', label: 'All', count: list.data ? scope.length : undefined },
            ...TABS.map((s) => ({ value: s, label: LABELS.status[s], count: list.data ? counts[s] : undefined })),
          ]}
        />
        <SearchInput value={param('q')} onChange={(v) => setParam('q', v)} placeholder="Search ideas" />
        <Select
          aria-label="Category"
          className={`${HALF} sm:w-44`}
          value={param('category')}
          onChange={(e) => setParam('category', e.target.value)}
          placeholder="All categories"
          options={list.data?.facets?.categories ?? []}
        />
        {LEVEL_FILTERS.map((f) => (
          <Select
            key={f.key}
            aria-label={f.label}
            className={`${HALF} ${f.width}`}
            value={param(f.key)}
            onChange={(e) => setParam(f.key, e.target.value)}
            placeholder={`Any ${f.noun}`}
            options={LEVELS.map((l) => ({ value: l, label: `${LABELS.level[l]} ${f.noun}` }))}
          />
        ))}
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
        <Select
          aria-label="Sort"
          className={`${HALF} sm:ml-auto sm:w-44`}
          value={sort}
          onChange={(e) => setParam('sort', e.target.value)}
          options={SORTS}
        />
      </FilterBar>

      {list.isPending ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={list.refetch} />
        </Card>
      ) : (
        <div className={`transition-opacity duration-200 ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
          {visible.filter(isOpen).length >= 3 && (
            <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <PipelineStats ideas={scope} counts={counts} />
              <EffortChart ideas={visible} />
            </div>
          )}
          {visible.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((idea) => (
                <IdeaCard key={idea._id} idea={idea} onConvert={setConverting} />
              ))}
            </div>
          ) : (
            <Card>
              {filtered ? (
                <EmptyState
                  icon={SearchX}
                  title={onlyStatus && status ? `No ${LABELS.status[status]} ideas.` : 'No ideas match these filters.'}
                  description="Try another status or loosen the filters."
                  action={<Button onClick={clearFilters}>Clear filters</Button>}
                />
              ) : (
                <EmptyState
                  icon={Lightbulb}
                  title="No ideas yet."
                  description="Capture possible products, score them, then turn the best into a product."
                  action={
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                      New idea
                    </Button>
                  }
                />
              )}
            </Card>
          )}
        </div>
      )}

      <IdeaFormModal open={creating} onClose={() => setCreating(false)} onSaved={(idea) => navigate(`/ideas/${idea._id}`)} />
      <ConvertIdeaModal open={Boolean(converting)} idea={converting} onClose={() => setConverting(null)} />
    </>
  );
}
