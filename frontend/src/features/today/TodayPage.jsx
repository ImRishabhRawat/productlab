import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CalendarClock, Circle, CircleCheck, NotebookPen, Repeat, Timer } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { addDays, timeToMinutes } from '@product-lab/shared/dates';
import { ProgressRing } from '../../components/charts/ProgressRing.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { fmtDate } from '../../lib/format.js';
import { useGet } from '../../lib/queries.js';
import { useMediaQuery } from '../../lib/useMediaQuery.js';
import { GoalsSummary } from '../goals/GoalsSummary.jsx';
import { EnableNotifications } from '../notifications/EnableNotifications.jsx';
import { LatestNotifications } from '../notifications/LatestNotifications.jsx';
import { BusinessSnapshot } from './BusinessSnapshot.jsx';
import { FocusCard, StartFocusModal } from './FocusCard.jsx';
import { HabitsCard } from './HabitsCard.jsx';
import { NowCard } from './NowCard.jsx';
import { OutcomeCard } from './OutcomeCard.jsx';
import { ReviewCard } from './ReviewCard.jsx';
import { Timeline } from './Timeline.jsx';
import { canComplete, toggleBlock, useSaveOutcome, useTodaySummary } from './useTodaySummary.js';

const WeekChart = lazy(() => import('./WeekChart.jsx').then((m) => ({ default: m.WeekChart })));

const awayFromZone = (now, clock) => {
  const local = new Date(now);
  return local.getHours() * 60 + local.getMinutes() !== clock.minutes || local.getDate() !== Number(clock.date.slice(8));
};
const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const NO_REVIEW_UI = { day: null, open: null, edit: false, dirty: false };
const DAY_QUERY = { placeholderData: undefined };

function ProgressCard({ progress, compact, className = '' }) {
  const { outcomeSet, outcomeDone, blocksTotal, blocksDone, habitsTotal, habitsDone, score } = progress;
  const parts = [
    outcomeSet
      ? { key: 'outcome', icon: outcomeDone ? CircleCheck : Circle, done: outcomeDone, text: '#1 outcome', sr: outcomeDone ? ' done' : ' not done' }
      : { key: 'outcome', icon: Circle, text: 'No #1 outcome' },
    blocksTotal > 0 && { key: 'blocks', icon: CalendarClock, done: blocksDone >= blocksTotal, text: `${blocksDone}/${blocksTotal} blocks` },
    habitsTotal > 0 && { key: 'habits', icon: Repeat, done: habitsDone >= habitsTotal, text: `${habitsDone}/${habitsTotal} habits` },
  ].filter(Boolean);
  return (
    <Card className={`flex items-center gap-4 p-4 sm:p-5 ${className}`}>
      <ProgressRing value={score} size={compact ? 64 : 76} stroke={compact ? 6 : 7} label="Today's progress" />
      <div className="min-w-0">
        <h2 className="text-[15px] font-medium text-ink">Today&apos;s progress</h2>
        <ul className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-body">
          {parts.map(({ key, icon: Icon, done, text, sr }) => (
            <li key={key} className="inline-flex items-center gap-1 whitespace-nowrap">
              <Icon className={`size-3.5 ${key === 'outcome' && done ? 'fill-positive text-canvas' : done ? 'text-positive' : 'text-faint'}`} aria-hidden />
              {text}
              {sr && <span className="sr-only">{sr}</span>}
            </li>
          ))}
        </ul>
        <p className="mt-1 hidden text-xs text-muted sm:block">
          {score == null ? 'Set a #1 outcome, plan blocks or add habits to measure the day.' : 'Outcome, blocks and habits count equally.'}
        </p>
      </div>
    </Card>
  );
}

const ACTION_COLUMNS = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

function QuickActions({ actions, className = '' }) {
  return (
    <div role="group" aria-label="Quick actions" className={`grid gap-2 ${ACTION_COLUMNS[actions.length]} ${className}`}>
      {actions.map(({ key, icon: Icon, label, onClick, pressed }) => (
        <button
          key={key}
          type="button"
          onClick={onClick}
          aria-pressed={pressed}
          className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-lg border border-hairline bg-canvas px-1 py-2 text-center text-xs leading-tight font-medium text-body transition-colors hover:bg-tint hover:text-ink"
        >
          <Icon className={`size-5 ${pressed ? 'fill-positive text-canvas' : 'text-ink'}`} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <>
      <PageHeader title="Today" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_24rem]" aria-busy="true" aria-label="Loading">
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-16" />
          <Skeleton className="h-44" />
        </div>
      </div>
    </>
  );
}

export default function TodayPage() {
  const { query, data, now, clock, time, blocks, current, next } = useTodaySummary();
  const prefs = useGet('/notification-preferences');
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMediaQuery('(min-width: 64rem)');
  const [focusOpen, setFocusOpen] = useState(false);
  const [reviewState, setReviewState] = useState({ ...NO_REVIEW_UI, link: null });
  const habitsRef = useRef(null);
  const reviewRef = useRef(null);
  const saveOutcome = useSaveOutcome(data?.date);
  const today = data?.date;
  const dayStart = prefs.data?.quietEnd;
  const lateNight = Boolean(dayStart) && clock.date === today && clock.minutes < timeToMinutes(dayStart);
  const defaultDay = lateNight ? addDays(today, -1) : today;
  const reviewDay = reviewState.dirty ? reviewState.day : defaultDay;
  const past = Boolean(today) && reviewDay !== today;
  const pastReview = useGet(past ? `/reviews/daily/${reviewDay}` : null, null, DAY_QUERY);
  const pastOutcome = useGet(past ? `/daily-outcomes/${reviewDay}` : null, null, DAY_QUERY);
  const deepLink = params.get('review') === '1';
  const ready = Boolean(data) && !prefs.isPending;

  if (deepLink && ready && reviewState.link !== location.key) {
    setReviewState((s) =>
      s.dirty ? { ...s, link: location.key } : { ...NO_REVIEW_UI, day: defaultDay, open: true, edit: 'link', link: location.key },
    );
  }

  useEffect(() => {
    if (deepLink && ready) navigate({ hash: '#review' }, { replace: true });
  }, [deepLink, ready, navigate]);

  if (!data) {
    if (!query.error) return <Loading />;
    return (
      <>
        <PageHeader title="Today" />
        <Card>
          <ErrorState error={query.error} onRetry={query.refetch} />
        </Card>
      </>
    );
  }

  const reviewAt = prefs.data?.dailyReviewTime;
  const evening = (reviewAt && clock.minutes >= timeToMinutes(reviewAt)) || (blocks.length > 0 && blocks.every((b) => b.state === 'past'));
  const onToggleBlock = (block) => saveOutcome.mutate(toggleBlock(data.outcome, block._id));
  const reviewUi = reviewState.day === reviewDay ? reviewState : NO_REVIEW_UI;
  const updateReview = (patch) =>
    setReviewState((s) => {
      const base = s.day === reviewDay ? s : { ...NO_REVIEW_UI, link: s.link, day: reviewDay };
      const next = patch ? { ...base, ...patch } : { ...NO_REVIEW_UI, link: s.link };
      return Object.keys(next).every((k) => next[k] === s[k]) ? s : next;
    });
  const openReview = () => {
    flushSync(() => updateReview({ open: true }));
    scrollTo(reviewRef);
  };
  const logHabit = () => {
    scrollTo(habitsRef);
    habitsRef.current?.querySelector('button[aria-pressed="false"]')?.focus({ preventScroll: true });
  };
  const running = data.focus.running;
  const actions = [
    ...(running || wide ? [] : [{ key: 'focus', icon: Timer, label: 'Start focus', onClick: () => setFocusOpen(true) }]),
    ...(current && canComplete(current) && !wide
      ? [
          {
            key: 'block',
            icon: CircleCheck,
            label: current.completed ? 'Block done' : 'Complete block',
            pressed: current.completed,
            onClick: () => onToggleBlock(current),
          },
        ]
      : []),
    { key: 'habit', icon: Repeat, label: 'Log habit', onClick: logHabit },
    { key: 'review', icon: NotebookPen, label: 'Daily review', onClick: openReview },
  ];
  const working = current?.category === 'break' ? null : current;
  const focusDefaults = { category: working?.category ?? 'business', goalId: working?.goalId, productId: working?.productId };

  const nowCard = (
    <NowCard blocks={blocks} current={current} next={next} time={time} reviewed={Boolean(data.review)} onToggle={onToggleBlock} onReview={openReview} />
  );
  const outcomeCard = <OutcomeCard outcome={data.outcome} date={data.date} />;
  const timeline = <Timeline blocks={blocks} time={time} onToggle={onToggleBlock} />;
  const review = (
    <ReviewCard
      cardRef={reviewRef}
      date={reviewDay}
      today={data.date}
      review={past ? pastReview.data : data.review}
      outcome={past ? pastOutcome.data : data.outcome}
      error={past && (pastReview.error ?? pastOutcome.error)}
      onRetry={() => [pastReview, pastOutcome].forEach((q) => q.refetch())}
      open={reviewUi.open ?? (past ? pastReview.data === null : evening)}
      edit={reviewUi.edit}
      onChange={updateReview}
    />
  );
  const progress = <ProgressCard progress={data.progress} compact={!wide} className="lg:order-first" />;
  const quickActions = <QuickActions actions={actions} />;
  const focus = <FocusCard focus={data.focus} onStart={() => setFocusOpen(true)} />;
  const habits = (
    <HabitsCard
      cardRef={habitsRef}
      habits={data.habits}
      targets={data.habitTargets}
      date={data.date}
      progress={data.progress}
      lateNight={lateNight}
    />
  );
  const business = <BusinessSnapshot business={data.business} />;
  const week = (
    <Suspense fallback={<Skeleton className="h-80" />}>
      <WeekChart date={data.date} onStartFocus={() => setFocusOpen(true)} />
    </Suspense>
  );
  const notifications = (
    <>
      <LatestNotifications />
      <div className="empty:hidden">
        <EnableNotifications compact />
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title="Today"
        description={`${fmtDate(data.date, { weekday: true })} · ${time}${awayFromZone(now, clock) ? ` · ${data.timezone} time` : ''}`}
      />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
          {nowCard}
          {outcomeCard}
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:gap-4">
          {quickActions}
          {(running || wide) && focus}
          {progress}
          {business}
          {week}
          <GoalsSummary />
          {notifications}
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:gap-4">
          {timeline}
          {!running && !wide && focus}
          {habits}
          {review}
        </div>
      </div>
      <StartFocusModal open={focusOpen} onClose={() => setFocusOpen(false)} defaults={focusDefaults} />
    </>
  );
}
