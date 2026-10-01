import { useState } from 'react';
import { CircleCheck, Plus, Target } from 'lucide-react';
import { Link } from 'react-router';
import { GOAL_LEVELS, GOAL_STATUSES, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { isoDateIn } from '@product-lab/shared/dates';
import { round } from '@product-lab/shared/metrics';
import { ProgressRing } from '../../components/charts/ProgressRing.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, Stat } from '../../components/ui/Card.jsx';
import { PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { Tabs } from '../../components/ui/Tabs.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { fmtNumber, plural } from '../../lib/format.js';
import { useList } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { GoalFormModal } from './GoalFormModal.jsx';
import { GoalMeter, GoalTiming, QuickUpdate, goalSource, isReached, useGoalStatus } from './GoalParts.jsx';

const { goalLevel: LEVELS, goalCategory: CATEGORIES, goalStatus: STATUSES } = PRODUCTIVITY_LABELS;
const FILTERS = [...GOAL_STATUSES, 'all'];
const cell = 'bg-canvas px-4 py-3.5 sm:px-5';

function Summary({ goals, loading }) {
  const { today } = useDateRange();
  const { timezone } = useSettings().data;
  const year = today.slice(0, 4);
  const active = goals.filter((g) => g.status === 'active');
  const targeted = active.filter((g) => g.progress != null);
  const average = targeted.length ? round(targeted.reduce((sum, g) => sum + g.progress, 0) / targeted.length, 1) : null;
  const achieved = goals
    .filter((g) => g.status === 'achieved' && g.achievedAt && isoDateIn(g.achievedAt, timezone).startsWith(year))
    .sort((a, b) => String(b.achievedAt).localeCompare(String(a.achievedAt)));
  const levels = GOAL_LEVELS.map((l) => [l, active.filter((g) => g.level === l).length]).filter(([, n]) => n);
  const value = (v) => (loading ? <Skeleton className="h-6 w-12" /> : v);
  const sub = (v) => (loading ? <Skeleton className="h-4 w-28" /> : v);

  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-2 gap-px bg-hairline-soft md:grid-cols-3">
        <div className={`col-span-2 flex items-center gap-4 md:col-span-1 ${cell}`}>
          {loading ? (
            <Skeleton className="size-16 shrink-0" style={{ borderRadius: '50%' }} />
          ) : (
            <ProgressRing value={average} size={64} stroke={7} label="Average progress of active goals">
              <span className="text-[13px] font-semibold text-ink tabular-nums">{average == null ? '—' : `${Math.round(average)}%`}</span>
            </ProgressRing>
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted">Average progress</div>
            <div className="mt-1 text-[13px] text-body">
              {sub(targeted.length ? `Across ${plural(targeted.length, 'active goal')} with a target` : 'No active goal has a target yet')}
            </div>
          </div>
        </div>
        <Stat
          label="Active"
          value={value(fmtNumber(active.length))}
          sub={sub(levels.length ? levels.map(([l, n]) => `${n} ${LEVELS[l].toLowerCase()}`).join(' · ') : 'None yet')}
          className={cell}
        />
        <Stat
          label={`Achieved in ${year}`}
          value={value(fmtNumber(achieved.length))}
          sub={sub(achieved.length ? <span className="block truncate">Latest: {achieved[0].title}</span> : 'None yet this year')}
          className={cell}
        />
      </div>
    </Card>
  );
}

function ProductLinks({ products }) {
  return (
    <ul className="relative z-[2] flex flex-wrap gap-1.5 max-md:gap-y-2" aria-label="Linked products">
      {products.map((p) => (
        <li key={p._id} className="max-w-full min-w-0">
          <Link
            to={`/products/${p._id}`}
            className="relative flex min-w-0 items-center gap-1 rounded-full border border-hairline px-2 py-0.5 text-xs text-body hover:bg-tint hover:text-ink max-md:min-h-8 max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1"
          >
            <span className="truncate">{p.name}</span>
            {p.status === 'killed' && <span className="shrink-0 text-muted">· killed</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function GoalCard({ goal }) {
  const status = useGoalStatus();
  const manual = goal.status === 'active' && goal.tracking === 'manual';
  const reached = isReached(goal);
  return (
    <Card as="article" className="relative flex min-w-0 flex-col gap-3 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap gap-1.5">
          <Badge>{CATEGORIES[goal.category]}</Badge>
          <Badge>{LEVELS[goal.level]}</Badge>
        </div>
        <GoalTiming goal={goal} className="mt-0.5" />
      </div>
      <h3 className="line-clamp-2 text-[15px] leading-snug font-medium text-ink">
        <Link to={`/goals/${goal._id}`} className="after:absolute after:inset-0 after:z-[1] hover:underline">
          {goal.title}
        </Link>
      </h3>
      <GoalMeter goal={goal} />
      <p className="-mt-1 truncate text-xs text-muted">{goalSource(goal)}</p>
      {goal.products.length > 0 && <ProductLinks products={goal.products} />}
      {(manual || reached) && (
        <div className="relative z-[2] mt-auto flex flex-wrap gap-2 pt-1">
          {manual && <QuickUpdate goal={goal} />}
          {reached && (
            <Button size="sm" variant="primary" icon={CircleCheck} loading={status.busy} onClick={() => status.set(goal, 'achieved')}>
              Mark achieved
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function CardsSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44" />
      ))}
    </div>
  );
}

export default function GoalsPage() {
  const params = useSearchParamState();
  const [creating, setCreating] = useState(false);
  const list = useList('goals');
  const goals = list.data?.items ?? [];
  const filter = FILTERS.includes(params.get('status')) ? params.get('status') : 'active';
  const shown = filter === 'all' ? goals : goals.filter((g) => g.status === filter);
  const setFilter = (value) => params.set('status', value === 'active' ? '' : value);
  const tabs = FILTERS.map((s) => ({
    value: s,
    label: s === 'all' ? 'All' : STATUSES[s],
    count: list.data ? (s === 'all' ? goals.length : goals.filter((g) => g.status === s).length) : undefined,
  }));
  const create = (label) => (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      {label}
    </Button>
  );
  const modal = <GoalFormModal open={creating} onClose={() => setCreating(false)} onSaved={(g) => setFilter(g.status)} />;

  if (list.isSuccess && !goals.length) {
    return (
      <>
        <PageHeader title="Goals" actions={create('New goal')} />
        <Card>
          <EmptyState
            className="px-4"
            icon={Target}
            title="No goals yet."
            description="Set a target, then link the products, focus and time that move it."
            action={create('Create your first goal')}
          />
        </Card>
        {modal}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Goals" description="Am I moving toward what matters?" actions={create('New goal')} />
      {list.error ? (
        <Card>
          <ErrorState error={list.error} onRetry={list.refetch} />
        </Card>
      ) : (
        <>
          <Summary goals={goals} loading={list.isPending} />
          <Tabs label="Status" className="mt-6 -mx-4 px-4 sm:mx-0 sm:px-0" tabs={tabs} value={filter} onChange={setFilter} />
          {list.isPending ? (
            <CardsSkeleton />
          ) : !shown.length ? (
            <Card className="mt-6">
              <EmptyState compact className="px-4" icon={Target} title={`No ${STATUSES[filter].toLowerCase()} goals.`} action={filter === 'active' ? create('New goal') : null} />
            </Card>
          ) : (
            GOAL_LEVELS.map((level) => {
              const items = shown.filter((g) => g.level === level);
              if (!items.length) return null;
              return (
                <Section key={level} title={LEVELS[level]} description={plural(items.length, 'goal')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {items.map((g) => (
                      <GoalCard key={g._id} goal={g} />
                    ))}
                  </div>
                </Section>
              );
            })
          )}
        </>
      )}
      {modal}
    </>
  );
}
