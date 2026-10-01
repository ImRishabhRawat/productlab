import mongoose from 'mongoose';
import { MAX_SERIES_DAYS } from '@product-lab/shared/constants';
import {
  addDays,
  autoGranularity,
  blockSpan,
  blockState,
  bucketStart,
  carryOver,
  clockIn,
  daysBetween,
  fitGranularity,
  goalPeriod,
  isoDateIn,
  minutesToTime,
  startOfDayIn,
  weekdayOf,
} from '@product-lab/shared/dates';
import { countsTowardProgress, dayProgress, goalProgress, habitTarget, habitWeek, round } from '@product-lab/shared/metrics';
import DailyOutcome from '../models/DailyOutcome.js';
import DailyReview from '../models/DailyReview.js';
import Experiment from '../models/Experiment.js';
import FocusSession from '../models/FocusSession.js';
import Habit from '../models/Habit.js';
import HabitCompletion from '../models/HabitCompletion.js';
import Product from '../models/Product.js';
import ScheduleSnapshot from '../models/ScheduleSnapshot.js';
import TimeBlock from '../models/TimeBlock.js';
import WeeklyReview from '../models/WeeklyReview.js';
import { idMap } from '../utils/http.js';
import { dataBounds, productPerformance, summary, summaryWithCompare, timeseries } from './analytics.js';
import { withNames } from './refs.js';
import { timezone } from './settings.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const later = (a, b) => (a > b ? a : b);
const weekDays = (habit, week) => daysBetween(later(habit.since, week), addDays(week, 6)) + 1;

function focusMinutes(session, now = new Date()) {
  if (session.status === 'running') return Math.min((now - new Date(session.startedAt)) / 60000, session.plannedMinutes);
  return session.minutes ?? 0;
}

async function sessionsBetween(from, to, tz, extra = {}) {
  return FocusSession.find({
    ...extra,
    status: { $ne: 'cancelled' },
    startedAt: { $gte: startOfDayIn(from, tz), $lt: startOfDayIn(addDays(to, 1), tz) },
  }).lean();
}

async function activeHabits(tz) {
  const [habits, firsts] = await Promise.all([
    Habit.find({ archived: false }).sort({ order: 1, createdAt: 1 }).lean(),
    HabitCompletion.aggregate([{ $group: { _id: '$habitId', date: { $min: '$date' } } }]),
  ]);
  const first = new Map(firsts.map((f) => [String(f._id), f.date]));
  return habits.map((h) => {
    const created = isoDateIn(h.createdAt, tz);
    const done = first.get(String(h._id));
    return { ...h, since: done && done < created ? done : created };
  });
}

async function firstRecord(tz) {
  const [session, outcome, completion, metrics] = await Promise.all([
    FocusSession.findOne({ status: { $ne: 'cancelled' } }).sort({ startedAt: 1 }).select('startedAt').lean(),
    DailyOutcome.findOne().sort({ date: 1 }).select('date').lean(),
    HabitCompletion.findOne().sort({ date: 1 }).select('date').lean(),
    dataBounds(),
  ]);
  const dates = [session && isoDateIn(session.startedAt, tz), outcome?.date, completion?.date, metrics?.from].filter(Boolean);
  return dates.sort()[0] ?? null;
}

const named = async (doc) => doc && (await withNames([doc]))[0];

export async function todaySummary(now = new Date()) {
  const tz = await timezone();
  const clock = clockIn(now, tz);
  const { date } = clock;
  const yesterday = weekdayOf(addDays(date, -1));
  const week = bucketStart(date, 'week');
  const [blocks, outcome, habits, completions, running, sessions, review, activeExperiments, top] = await Promise.all([
    TimeBlock.find({ enabled: true, days: { $in: [clock.weekday, yesterday] } }).lean(),
    DailyOutcome.findOne({ date }).lean(),
    activeHabits(tz),
    HabitCompletion.find({ date: { $gte: week, $lte: date } }).lean(),
    FocusSession.findOne({ status: 'running' }).lean(),
    sessionsBetween(date, date, tz),
    DailyReview.findOne({ date }).lean(),
    Experiment.countDocuments({ status: 'running' }),
    productPerformance({ from: addDays(date, -6), to: date }),
  ]);
  const completed = new Set((outcome?.completedBlocks ?? []).map(String));
  const isToday = (b) => b.days.includes(clock.weekday);
  const carried = (b) => (b.days.includes(yesterday) ? carryOver(b, clock.minutes) : null);
  const state = (b) => (carried(b) == null ? blockState(b, clock.minutes) : 'current');
  const since = (b) => blockSpan(b).from - (carried(b) == null ? 0 : 1440);
  const present = (b) => ({
    _id: b._id,
    name: b.name,
    start: b.start,
    end: b.end,
    category: b.category,
    goalId: b.goalId,
    productId: b.productId,
    minutes: blockSpan(b).minutes,
    state: state(b),
    completed: completed.has(String(b._id)),
  });
  const items = blocks
    .filter(isToday)
    .map(present)
    .sort((a, b) => a.start.localeCompare(b.start));
  const current = blocks
    .filter((b) => (isToday(b) || carried(b) != null) && state(b) === 'current')
    .sort((a, b) => since(b) - since(a))[0];
  const next = items.find((b) => b.state === 'upcoming') ?? null;
  const done = new Set(completions.filter((c) => c.date === date).map((c) => String(c.habitId)));
  const thisWeek = (h) => completions.filter((c) => String(c.habitId) === String(h._id)).length;
  const required = habits.filter((h) => done.has(String(h._id)) || thisWeek(h) < habitTarget(h.targetPerWeek, weekDays(h, week)));
  const work = items.filter(countsTowardProgress);
  const progress = {
    outcomeSet: Boolean(outcome?.title),
    outcomeDone: Boolean(outcome?.done),
    blocksTotal: work.length,
    blocksDone: work.filter((b) => b.completed).length,
    habitsTotal: required.length,
    habitsDone: habits.filter((h) => done.has(String(h._id))).length,
  };
  const [business, namedOutcome, namedRunning] = await Promise.all([summary({ from: date, to: date }), named(outcome), named(running)]);
  const topProduct = top.find((p) => p.hasData && p.revenue > 0) ?? null;
  return {
    date,
    timezone: tz,
    now: { time: minutesToTime(clock.minutes), minutes: clock.minutes, weekday: clock.weekday },
    blocks: items,
    current: current ? { ...present(current), remaining: carried(current) ?? blockSpan(current).to - clock.minutes } : null,
    next: next && { ...next, startsIn: blockSpan(next).from - clock.minutes },
    outcome: namedOutcome,
    habits: habits.map((h) => ({ _id: h._id, name: h.name, targetPerWeek: h.targetPerWeek, done: done.has(String(h._id)) })),
    focus: { running: namedRunning, minutesToday: round(sessions.reduce((s, x) => s + focusMinutes(x, now), 0), 0) },
    review: review ?? null,
    progress: { ...progress, score: dayProgress({ ...progress, blocksDue: progress.blocksTotal }) },
    business: {
      revenue: business.revenue,
      spend: business.spend,
      purchases: business.purchases,
      roas: business.roas,
      activeExperiments,
      topProduct: topProduct && { _id: topProduct._id, name: topProduct.name, revenue: topProduct.revenue, status: topProduct.status },
    },
  };
}

export async function snapshotSchedule() {
  const date = clockIn(new Date(), await timezone()).date;
  const blocks = await TimeBlock.find({ enabled: true }).select('category days createdAt').lean();
  await ScheduleSnapshot.updateOne({ date }, { $setOnInsert: { blocks } }, { upsert: true });
}

export async function productivitySeries({ from, to, granularity, goalId, productId } = {}) {
  const tz = await timezone();
  const today = clockIn(new Date(), tz).date;
  const end = to ?? today;
  const first = from ? null : await firstRecord(tz);
  const start = later(from ?? (first && first < end ? first : end), addDays(end, 1 - MAX_SERIES_DAYS));
  const gran = fitGranularity({ from: start, to: end }, granularity ?? autoGranularity({ from: start, to: end }));
  const focusOn = { ...(goalId && { goalId: oid(goalId) }), ...(productId && { productId: oid(productId) }) };
  const [sessions, outcomes, completions, habits, blocks, snapshots, experiments, business] = await Promise.all([
    sessionsBetween(start, end, tz, focusOn),
    DailyOutcome.find({ date: { $gte: start, $lte: end } }).lean(),
    HabitCompletion.find({ date: { $gte: bucketStart(start, 'week'), $lte: end } }).lean(),
    activeHabits(tz),
    TimeBlock.find({ enabled: true }).lean(),
    ScheduleSnapshot.find({ date: { $gt: start } }).sort({ date: 1 }).lean(),
    Experiment.find({ status: 'completed', endDate: { $gte: start, $lte: end } }).select('endDate').lean(),
    timeseries({ from: start, to: end, granularity: gran }),
  ]);
  const plan = (list) =>
    list.filter(countsTowardProgress).map((b) => ({ id: String(b._id), days: b.days, since: isoDateIn(b.createdAt, tz) }));
  const current = plan(blocks);
  const past = snapshots.map((s) => ({ date: s.date, blocks: plan(s.blocks) }));
  const scheduled = (date) =>
    (past.find((s) => s.date > date)?.blocks ?? current).filter((b) => b.days.includes(weekdayOf(date)) && b.since <= date);
  const days = new Map();
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.set(d, {
      focusMinutes: 0,
      sessions: 0,
      outcomeSet: 0,
      outcomeDone: 0,
      blocksScheduled: d <= today ? scheduled(d).length : 0,
      blocksCompleted: 0,
      habitsDone: 0,
      habitsPossible: 0,
      experimentsCompleted: 0,
    });
  }
  const checked = new Set(completions.map((c) => `${c.habitId}:${c.date}`));
  const last = end < today ? end : today;
  for (const h of habits) {
    for (let week = bucketStart(later(h.since, start), 'week'); week <= last; week = addDays(week, 7)) {
      const dates = [];
      for (let d = later(h.since, week); d <= addDays(week, 6) && d <= last; d = addDays(d, 1)) dates.push(d);
      habitWeek(h.targetPerWeek, weekDays(h, week), dates.map((d) => checked.has(`${h._id}:${d}`))).forEach((step, i) => {
        const day = days.get(dates[i]);
        if (!day) return;
        day.habitsDone += step.done;
        day.habitsPossible += step.possible;
      });
    }
  }
  for (const s of sessions) {
    const day = days.get(isoDateIn(s.startedAt, tz));
    if (!day) continue;
    day.focusMinutes += focusMinutes(s);
    day.sessions += 1;
  }
  for (const o of outcomes) {
    const day = days.get(o.date);
    if (!day || o.date > today) continue;
    const due = new Set(scheduled(o.date).map((b) => b.id));
    day.outcomeSet = o.title ? 1 : 0;
    day.outcomeDone = o.title && o.done ? 1 : 0;
    day.blocksCompleted = (o.completedBlocks ?? []).filter((id) => due.has(String(id))).length;
  }
  for (const x of experiments) if (days.has(x.endDate)) days.get(x.endDate).experimentsCompleted += 1;

  const buckets = new Map(
    business.points.map(({ key, revenue, spend, purchases, contribution }) => [key, { key, revenue, spend, purchases, contribution }]),
  );
  for (const [date, d] of days) {
    const b = buckets.get(bucketStart(date, gran));
    if (!b) continue;
    for (const [k, v] of Object.entries(d)) b[k] = (b[k] ?? 0) + v;
  }
  const points = [...buckets.values()].map((b) => ({
    ...b,
    focusHours: round((b.focusMinutes ?? 0) / 60, 2),
    habitRate: b.habitsPossible ? round(((b.habitsDone ?? 0) / b.habitsPossible) * 100, 1) : null,
    blockRate: b.blocksScheduled ? round(((b.blocksCompleted ?? 0) / b.blocksScheduled) * 100, 1) : null,
  }));
  const byProduct = new Map();
  const byCategory = new Map();
  for (const s of sessions) {
    const minutes = focusMinutes(s);
    byCategory.set(s.category, (byCategory.get(s.category) ?? 0) + minutes);
    if (s.productId) byProduct.set(String(s.productId), (byProduct.get(String(s.productId)) ?? 0) + minutes);
  }
  const products = idMap(await Product.find({ _id: { $in: [...byProduct.keys()] } }).select('name').lean());
  return {
    from: start,
    to: end,
    granularity: gran,
    points,
    focusByProduct: [...byProduct]
      .map(([id, m]) => ({ _id: id, name: products.get(id)?.name ?? 'Deleted product', hours: round(m / 60, 2) }))
      .sort((a, b) => b.hours - a.hours),
    focusByCategory: [...byCategory].map(([category, m]) => ({ category, hours: round(m / 60, 2) })).sort((a, b) => b.hours - a.hours),
  };
}

export async function weekReview(start) {
  const tz = await timezone();
  const today = clockIn(new Date(), tz).date;
  const weekStart = bucketStart(start ?? today, 'week');
  const weekEnd = addDays(weekStart, 6);
  const cutoff = today >= weekStart && today < weekEnd ? today : weekEnd;
  const previousRange = { from: addDays(weekStart, -7), to: addDays(cutoff, -7) };
  const completedIn = ({ from, to }) => ({ status: 'completed', endDate: { $gte: from, $lte: to } });
  const [business, series, previous, experiments, previousExperiments, habits, completions, review] = await Promise.all([
    summaryWithCompare({ from: weekStart, to: weekEnd }, previousRange),
    productivitySeries({ from: weekStart, to: weekEnd, granularity: 'day' }),
    productivitySeries({ from: addDays(weekStart, -7), to: addDays(weekStart, -1), granularity: 'week' }),
    Experiment.find(completedIn({ from: weekStart, to: weekEnd })).select('name productId endDate').sort({ endDate: 1 }).lean(),
    Experiment.countDocuments(completedIn(previousRange)),
    activeHabits(tz),
    HabitCompletion.find({ date: { $gte: weekStart, $lte: weekEnd } }).sort({ date: 1 }).lean(),
    WeeklyReview.findOne({ weekStart }).lean(),
  ]);
  const products = idMap(await Product.find({ _id: { $in: experiments.map((x) => x.productId) } }).select('name').lean());
  const total = (points, key) => points.reduce((s, p) => s + (p[key] ?? 0), 0);
  const summarize = (points) => ({
    focusHours: round(total(points, 'focusMinutes') / 60, 2),
    sessions: total(points, 'sessions'),
    outcomesSet: total(points, 'outcomeSet'),
    outcomesDone: total(points, 'outcomeDone'),
    blocksScheduled: total(points, 'blocksScheduled'),
    blocksCompleted: total(points, 'blocksCompleted'),
    habitsDone: total(points, 'habitsDone'),
    habitsPossible: total(points, 'habitsPossible'),
    experimentsCompleted: total(points, 'experimentsCompleted'),
  });
  return {
    weekStart,
    weekEnd,
    business: {
      ...business,
      experimentsCompleted: experiments.length,
      previousExperimentsCompleted: previousExperiments,
      experiments: experiments.map((x) => ({ ...x, productName: products.get(String(x.productId))?.name ?? '' })),
    },
    productivity: { current: summarize(series.points), previous: summarize(previous.points), points: series.points },
    focusByProduct: series.focusByProduct,
    habits: habits
      .filter((h) => h.since <= weekEnd)
      .map((h) => {
        const dates = completions.filter((c) => String(c.habitId) === String(h._id)).map((c) => c.date);
        return { _id: h._id, name: h.name, targetPerWeek: h.targetPerWeek, done: dates.length, dates };
      }),
    review: review ?? null,
  };
}

export async function goalValues(goals) {
  const tz = await timezone();
  const today = clockIn(new Date(), tz).date;
  return Promise.all(
    goals.map(async (g) => {
      const { from, to } = goalPeriod(g, today, tz);
      const sessions = await sessionsBetween(from, to, tz, { goalId: oid(g._id) });
      const focusHours = round(sessions.reduce((s, x) => s + focusMinutes(x), 0) / 60, 2);
      let current = g.currentValue;
      if (g.tracking === 'focus_hours') current = focusHours;
      else if (g.tracking !== 'manual') {
        current = g.productIds?.length && from <= to ? (await summary({ productIds: g.productIds, from, to }))[g.tracking] : 0;
      }
      const daysLeft = g.targetDate ? daysBetween(today, g.targetDate) : null;
      return { ...g, current, progress: goalProgress(current, g.targetValue), focusHours, daysLeft };
    }),
  );
}
