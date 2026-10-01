import { useState } from 'react';
import { ArrowRightLeft, Check, ChevronDown, CircleCheck, Package, Pencil, Target, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { GOAL_PRODUCT_TRACKING, GOAL_STATUSES, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { daysBetween, goalPeriod, isoDateIn } from '@product-lab/shared/dates';
import { Meter } from '../../components/charts/Meter.jsx';
import { ProgressRing } from '../../components/charts/ProgressRing.jsx';
import { Badge, Dot, StatusBadge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink, IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { ConfirmDialog } from '../../components/ui/Modal.jsx';
import { PageHeader, Section } from '../../components/ui/PageHeader.jsx';
import { Popover } from '../../components/ui/Popover.jsx';
import { EmptyState, ErrorState, PageLoader } from '../../components/ui/States.jsx';
import { SegmentedControl } from '../../components/ui/Tabs.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useDateRange } from '../../lib/dateRange.jsx';
import { DASH, fmtDate, fmtPercent, fmtRange } from '../../lib/format.js';
import { metricOptions } from '../../lib/metricDisplay.js';
import { useAnalytics, useGet, useItem, useList, useRemove } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { statusMeta } from '../../lib/status.js';
import { CORRELATION } from '../reviews/ReviewParts.jsx';
import { BlocksCard, ExperimentResults, FocusCard, ProductResults, RESULT_METRICS } from './GoalChain.jsx';
import { GoalFormModal } from './GoalFormModal.jsx';
import {
  QuickUpdate,
  TONE_COLORS,
  fmtSpan,
  goalSource,
  goalTone,
  isMoneyGoal,
  isReached,
  unitLabel,
  useGoalFormat,
  useGoalStatus,
} from './GoalParts.jsx';

const { goalLevel: LEVELS, goalCategory: CATEGORIES } = PRODUCTIVITY_LABELS;
const VERBS = { active: 'Reactivate', achieved: 'Mark achieved', paused: 'Pause', dropped: 'Drop' };

function GoalError({ error, onRetry }) {
  const missing = error.status === 404;
  return (
    <>
      <PageHeader title={missing ? 'Goal not found' : 'Goal'} back={{ to: '/goals', label: 'Goals' }} />
      <Card>
        {missing ? (
          <EmptyState
            className="px-4"
            icon={Target}
            title="This goal does not exist."
            description="It may have been deleted, or the link is mistyped."
            action={<ButtonLink to="/goals">All goals</ButtonLink>}
          />
        ) : (
          <ErrorState error={error} onRetry={onRetry} />
        )}
      </Card>
    </>
  );
}

function StatusMenu({ goal }) {
  const status = useGoalStatus();
  return (
    <Popover
      align="right"
      trigger={({ open, toggle }) => (
        <Button icon={ArrowRightLeft} loading={status.busy} onClick={toggle} aria-expanded={open}>
          Change status
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </Button>
      )}
    >
      {({ close }) => (
        <ul className="w-56 p-1.5" aria-label="Change status">
          {GOAL_STATUSES.map((s) => {
            const current = s === goal.status;
            const meta = statusMeta('goalStatus', s);
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={current}
                  onClick={() => {
                    close();
                    status.set(goal, s);
                  }}
                  className="flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-ink hover:bg-tint/70 disabled:hover:bg-transparent max-md:min-h-10"
                >
                  <Dot color={meta.color} />
                  <span className="flex-1">{current ? meta.label : VERBS[s]}</span>
                  {current && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted">
                      <Check className="size-3.5 stroke-[2.5]" aria-hidden />
                      Current
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Popover>
  );
}

function TimeMeter({ goal, period, onEdit }) {
  const { today } = useDateRange();
  const { timezone } = useSettings().data;
  if (!goal.targetDate) {
    return (
      <div className="min-w-0 self-center">
        <p className="text-[13px] text-body">Time</p>
        <p className="mt-1 text-[13px] text-muted">
          No target date.{' '}
          <button
            type="button"
            onClick={onEdit}
            className="relative text-ink underline-offset-2 hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3"
          >
            Set one
          </button>
        </p>
      </div>
    );
  }
  const total = Math.max(daysBetween(period.from, goal.targetDate), 1);
  const achieved = goal.status === 'achieved' && goal.achievedAt ? isoDateIn(goal.achievedAt, timezone) : null;
  const elapsed = Math.min(Math.max(daysBetween(period.from, achieved ?? today), 0), total);
  const left = daysBetween(today, goal.targetDate);
  const overdue = left < 0 && goal.status === 'active' && !isReached(goal);
  const valueLabel = achieved
    ? `Achieved ${fmtDate(achieved)}`
    : today < period.from
      ? `Starts in ${fmtSpan(daysBetween(today, period.from))}`
      : left < 0
        ? `${fmtSpan(-left)} past target date`
        : `${fmtSpan(elapsed)} elapsed · ${left ? `${fmtSpan(left)} left` : 'due today'}`;
  return (
    <div className="min-w-0 self-center">
      <Meter
        value={elapsed}
        max={total}
        tone={overdue ? 'warning' : 'muted'}
        label="Time"
        valueLabel={valueLabel}
        marker={{ value: elapsed, label: achieved ? 'Achieved' : 'Today' }}
      />
      <div className="mt-1 flex flex-wrap justify-between gap-x-3 text-xs text-muted">
        <span>Start {fmtDate(period.from, { year: true })}</span>
        <span className="font-medium text-ink">Target date {fmtDate(goal.targetDate, { year: true })}</span>
      </div>
    </div>
  );
}

function Hero({ goal, period, onEdit }) {
  const fmt = useGoalFormat();
  const status = useGoalStatus();
  const { currency } = useSettings().data;
  const unit = goal.unit && goal.current != null && !isMoneyGoal(goal, currency) ? unitLabel(goal, goal.current) : '';
  const targeted = goal.targetValue > 0;
  const manual = goal.status === 'active' && goal.tracking === 'manual';
  const reached = isReached(goal);
  return (
    <Card className="p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="flex min-w-0 items-center gap-4 sm:gap-6">
          <ProgressRing value={targeted ? goal.progress : null} size={112} stroke={10} color={TONE_COLORS[goalTone(goal)]} label="Progress toward the target">
            <span className="text-lg font-semibold text-ink tabular-nums">{targeted ? fmtPercent(goal.progress) : DASH}</span>
            <span className="text-[11px] text-muted">{targeted ? 'of target' : 'no target'}</span>
          </ProgressRing>
          <div className="min-w-0">
            <div className="text-[30px] leading-none font-semibold tracking-[-0.02em] break-words text-ink sm:text-[40px] lg:text-5xl">
              {fmt(goal, goal.current, { unit: false })}
              {unit && <span className="ml-1.5 text-base font-medium tracking-normal text-body sm:text-lg">{unit}</span>}
            </div>
            <p className="mt-2 text-[13px] text-body">{targeted ? `of ${fmt(goal, goal.targetValue)} target` : 'No target set'}</p>
            <p className="mt-1 text-xs text-muted">
              {goalSource(goal)}
              {(goal.tracking === 'focus_hours' || (goal.tracking !== 'manual' && goal.products.length > 0)) &&
                ` since ${fmtDate(period.from, { year: true })}`}
            </p>
          </div>
        </div>
        <TimeMeter goal={goal} period={period} onEdit={onEdit} />
      </div>
      {(manual || reached) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline-soft pt-4">
          {reached && (
            <>
              <p className="mr-auto text-[13px] text-body">The target is reached. Mark it achieved when you are happy with it.</p>
              <Button variant="primary" icon={CircleCheck} loading={status.busy} onClick={() => status.set(goal, 'achieved')}>
                Mark achieved
              </Button>
            </>
          )}
          {manual && <QuickUpdate goal={goal} />}
        </div>
      )}
    </Card>
  );
}

export default function GoalDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { today } = useDateRange();
  const { timezone } = useSettings().data;
  const [modal, setModal] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [metric, setMetric] = useState(null);
  const goal = useItem('goals', id, { enabled: !removing });
  const g = goal.data;
  const period = g ? goalPeriod(g, today, timezone) : {};
  const linked = g?.productIds?.length > 0;
  const started = period.from <= period.to;
  const results = { from: period.from, to: period.to };
  const products = useAnalytics('products', results, { enabled: linked && started });
  const experiments = useAnalytics('experiments', results, { enabled: linked && started });
  const focus = useGet('/productivity/series', { ...results, goalId: id }, { enabled: started && !removing });
  const sessions = useList('focus-sessions', { goalId: id, limit: 20 }, { enabled: Boolean(g) && !removing });
  const blocks = useList('time-blocks');
  const remove = useRemove('goals');

  if (goal.isPending) return <PageLoader />;
  if (goal.error) return <GoalError error={goal.error} onRetry={goal.refetch} />;

  const shown = metric ?? (GOAL_PRODUCT_TRACKING.includes(g.tracking) ? g.tracking : 'revenue');
  const business = linked || GOAL_PRODUCT_TRACKING.includes(g.tracking);
  const edit = () => setModal('edit');

  async function confirmDelete() {
    setRemoving(true);
    try {
      await remove.mutateAsync(id);
      toast.success('Goal deleted');
      navigate('/goals', { replace: true });
    } catch (err) {
      setRemoving(false);
      setModal(null);
      toast.error(err);
    }
  }

  return (
    <>
      <PageHeader
        back={{ to: '/goals', label: 'Goals' }}
        title={g.title}
        meta={
          <>
            <StatusBadge kind="goalStatus" value={g.status} />
            <Badge>{LEVELS[g.level]}</Badge>
            <Badge>{CATEGORIES[g.category]}</Badge>
          </>
        }
        description={g.description || null}
        actions={
          <>
            <IconButton icon={Trash2} variant="secondary" label="Delete goal" onClick={() => setModal('delete')} />
            <StatusMenu goal={g} />
            <Button icon={Pencil} onClick={edit}>
              Edit
            </Button>
          </>
        }
      />

      <Hero goal={g} period={period} onEdit={edit} />

      {business && (
        <Section
          title="Business results"
          description={
            !linked ? null : started ? `Recorded for linked products · ${fmtRange(period)}` : `Results count from ${fmtDate(period.from, { year: true })}`
          }
          actions={linked && started && <SegmentedControl size="sm" label="Metric" options={metricOptions(RESULT_METRICS)} value={shown} onChange={setMetric} />}
        >
          {!linked ? (
            <Card>
              <EmptyState
                compact
                className="px-4"
                icon={Package}
                title="No linked products."
                description="Link the products whose results count toward this goal."
                action={
                  <Button size="sm" onClick={edit}>
                    Link products
                  </Button>
                }
              />
            </Card>
          ) : !started ? (
            <Card>
              <EmptyState compact className="px-4" icon={Package} title="Nothing recorded yet." description="Results start counting on the start date." />
            </Card>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              <ProductResults goal={g} query={products} metric={shown} />
              <ExperimentResults goal={g} query={experiments} metric={shown} />
            </div>
          )}
        </Section>
      )}

      <Section
        title="Time invested"
        description={linked && started ? CORRELATION : 'Focus sessions and scheduled blocks linked to this goal'}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FocusCard goal={g} period={period} series={focus} sessions={sessions} />
          <BlocksCard goal={g} query={blocks} />
        </div>
      </Section>

      <Section title="Notes">
        <Card className="p-4 sm:p-5">
          {g.notes ? (
            <p className="text-[13px] leading-relaxed whitespace-pre-line text-body">{g.notes}</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted">No notes yet.</p>
              <Button size="sm" variant="ghost" icon={Pencil} onClick={edit}>
                Add notes
              </Button>
            </div>
          )}
        </Card>
      </Section>

      <GoalFormModal open={modal === 'edit'} onClose={() => setModal(null)} goal={g} />
      <ConfirmDialog
        open={modal === 'delete'}
        onClose={() => setModal(null)}
        onConfirm={confirmDelete}
        loading={remove.isPending}
        title="Delete this goal?"
        message="Its time blocks, focus sessions and daily outcomes stay but are unlinked from it. To keep its history, drop it instead."
        confirmLabel="Delete goal"
      />
    </>
  );
}
