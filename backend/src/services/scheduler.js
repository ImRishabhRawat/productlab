import {
  addDays,
  blockSpan,
  bucketStart,
  clockIn,
  minutesToTime,
  timeToMinutes,
  weekdayOf,
  zonedInstant,
} from '@product-lab/shared/dates';
import { LAST_WEEK_REVIEW_DAYS } from '@product-lab/shared/constants';
import { round } from '@product-lab/shared/metrics';
import DailyOutcome from '../models/DailyOutcome.js';
import DailyReview from '../models/DailyReview.js';
import FocusSession from '../models/FocusSession.js';
import Habit from '../models/Habit.js';
import HabitCompletion from '../models/HabitCompletion.js';
import Product from '../models/Product.js';
import TimeBlock from '../models/TimeBlock.js';
import { money } from './alerts.js';
import { productPerformance, summary } from './analytics.js';
import { notify, preferences } from './notify.js';
import { productivitySeries } from './productivity.js';
import { timezone } from './settings.js';

const WINDOW = 3;
const FOCUS_GRACE = 15;
const START_TTL = 15 * 60;
const DAY = 24 * 3600;

async function blockReminders(clock, due, send, priority) {
  const blocks = await TimeBlock.find({ enabled: true }).lean();
  for (const b of blocks) {
    const { from, to, minutes } = blockSpan(b);
    const r = b.reminders ?? {};
    for (const date of [addDays(clock.date, -1), clock.date, addDays(clock.date, 1)]) {
      if (!b.days.includes(weekdayOf(date))) continue;
      const key = (kind, minute) => `block:${b._id}:${date}:${kind}:${minutesToTime(minute)}`;
      if (r.beforeStart && due(date, from - r.beforeStart)) {
        await send({
          category: 'schedule',
          type: 'block_reminder',
          title: `${b.name} starts in ${r.beforeStart} min`,
          body: priority ? `Today's #1: ${priority}` : `${b.start}–${b.end}`,
          url: '/today',
          dedupeKey: key('before', from - r.beforeStart),
          urgency: 'high',
          ttl: r.beforeStart * 60,
        });
      }
      if (r.atStart !== false && due(date, from)) {
        await send({
          category: 'schedule',
          type: 'block_start',
          title: `${b.name} starts now`,
          body: priority ? `Today's priority: ${priority}` : `Until ${b.end}`,
          url: '/today',
          dedupeKey: key('start', from),
          urgency: 'high',
          ttl: Math.min(minutes * 60, START_TTL),
        });
      }
      if (r.beforeEnd && due(date, to - r.beforeEnd)) {
        await send({
          category: 'schedule',
          type: 'block_end',
          title: `${b.name} ends in ${r.beforeEnd} min`,
          body: 'Wrap up and note what moved forward.',
          url: '/today',
          dedupeKey: key('end', to - r.beforeEnd),
          urgency: 'high',
          ttl: r.beforeEnd * 60,
        });
      }
    }
  }
}

async function focusReminders(now, send) {
  const running = await FocusSession.find({ status: 'running' }).lean();
  for (const s of running) {
    const planned = new Date(s.startedAt).getTime() + s.plannedMinutes * 60000;
    const late = now.getTime() - planned;
    if (late >= FOCUS_GRACE * 60000) {
      await FocusSession.updateOne(
        { _id: s._id, status: 'running' },
        { $set: { status: 'completed', endedAt: new Date(planned), minutes: s.plannedMinutes } },
      );
    } else if (late >= 0 && !s.endNotified) {
      await FocusSession.updateOne({ _id: s._id }, { $set: { endNotified: true } });
      await send({
        category: 'focus',
        type: 'focus_end',
        title: 'Focus session complete',
        body: `${s.plannedMinutes} min${s.label ? ` · ${s.label}` : ''}`,
        url: '/today',
        dedupeKey: `focus:${s._id}`,
        urgency: 'high',
        ttl: FOCUS_GRACE * 60,
      });
    }
  }
}

async function businessChecks(clock, due, send, prefs, restOfDay) {
  const fmt = await money();
  if (due(clock.date, timeToMinutes(prefs.business.dailyRevenueTime))) {
    const t = await summary({ from: clock.date, to: clock.date });
    if (t.revenue || t.spend) {
      await send({
        category: 'business',
        type: 'daily_revenue',
        title: `Today: ${fmt(t.revenue)} revenue`,
        body: `${t.purchases} purchases · ${fmt(t.spend)} ad spend${t.roas ? ` · ROAS ${t.roas}x` : ''}`,
        url: '/',
        dedupeKey: `revenue:${clock.date}`,
        ttl: restOfDay,
      });
    }
  }
  if (due(clock.date, 9 * 60)) {
    const yesterday = await summary({ from: addDays(clock.date, -1), to: addDays(clock.date, -1) });
    const before = await summary({ from: addDays(clock.date, -8), to: addDays(clock.date, -2) });
    if (yesterday.landingPageViews >= 150 && before.conversionRate > 0 && yesterday.conversionRate <= before.conversionRate * 0.65) {
      await send({
        category: 'business',
        type: 'conversion_drop',
        title: `Conversion fell to ${yesterday.conversionRate}% yesterday`,
        body: `Previous 7-day rate ${before.conversionRate}% · check where the funnel breaks`,
        url: '/analytics',
        dedupeKey: `conversion:${clock.date}`,
        ttl: restOfDay,
      });
    }
  }
  if (clock.minutes % 15 < WINDOW) {
    const budgets = await Product.find({ 'budget.daily': { $gt: 0 }, status: { $ne: 'killed' } }).select('name budget').lean();
    if (!budgets.length) return;
    const spend = new Map((await productPerformance({ from: clock.date, to: clock.date })).map((p) => [String(p._id), p.spend]));
    for (const p of budgets) {
      const spent = spend.get(String(p._id)) ?? 0;
      if (spent <= p.budget.daily) continue;
      await send({
        category: 'business',
        type: 'ad_spend',
        title: `${p.name} spent ${fmt(spent)} today`,
        body: `Daily budget is ${fmt(p.budget.daily)}`,
        url: `/products/${p._id}`,
        dedupeKey: `spend:${p._id}:${clock.date}`,
        ttl: restOfDay,
      });
    }
  }
}

export async function tick(now = new Date()) {
  const prefs = await preferences();
  const sent = [];
  const send = async (n) => {
    const result = await notify({ ...n, prefs, now });
    if (result) sent.push(result);
  };
  await focusReminders(now, send);
  if (!prefs.enabled) return sent;
  const tz = await timezone();
  const clock = clockIn(now, tz);
  const due = (date, minutes) => {
    const late = now - zonedInstant(date, minutes, tz);
    return late >= 0 && late < WINDOW * 60000;
  };
  const restOfDay = (1440 - clock.minutes) * 60;
  const outcome = await DailyOutcome.findOne({ date: clock.date }).lean();
  const priority = outcome?.title && !outcome.done ? outcome.title : null;

  await blockReminders(clock, due, send, priority);

  if (due(clock.date, timeToMinutes(prefs.dailyOutcomeTime)) && !outcome?.done) {
    await send({
      category: 'outcome',
      type: 'daily_outcome',
      title: outcome?.title ? `Today's #1: ${outcome.title}` : "Set today's #1 outcome",
      body: outcome?.title ? 'Give it your first focus block.' : 'Pick the one result that would make today a win.',
      url: '/today',
      dedupeKey: `outcome:${clock.date}`,
      ttl: restOfDay,
    });
  }
  if (due(clock.date, timeToMinutes(prefs.dailyReviewTime)) && !(await DailyReview.exists({ date: clock.date }))) {
    await send({
      category: 'review',
      type: 'daily_review',
      title: 'Daily Review',
      body: "Record today's result and choose tomorrow's #1 outcome.",
      url: '/today?review=1',
      dedupeKey: `review:${clock.date}`,
      ttl: restOfDay,
    });
  }
  const reviewDay = [addDays(clock.date, -1), clock.date].find((date) => due(date, timeToMinutes(prefs.dailyReviewTime) + 15));
  const tomorrow = reviewDay && addDays(reviewDay, 1);
  if (tomorrow && !(await DailyOutcome.exists({ date: tomorrow, title: { $gt: '' } }))) {
    await send({
      category: 'outcome',
      type: 'tomorrow_outcome',
      title: "Set tomorrow's #1 outcome",
      body: 'Decide it tonight so tomorrow starts with the work that matters.',
      url: '/today?review=1',
      dedupeKey: `tomorrow:${tomorrow}`,
      ttl: restOfDay,
    });
  }
  if (clock.weekday === prefs.weeklyReviewDay && due(clock.date, timeToMinutes(prefs.weeklyReviewTime))) {
    const thisWeek = bucketStart(clock.date, 'week');
    const ended = LAST_WEEK_REVIEW_DAYS.includes(clock.weekday);
    const weekStart = ended ? addDays(thisWeek, -7) : thisWeek;
    const to = ended ? addDays(weekStart, 6) : clock.date;
    const [business, focus] = await Promise.all([
      summary({ from: weekStart, to }),
      productivitySeries({ from: weekStart, to, granularity: 'week' }),
    ]);
    const fmt = await money();
    const hours = round(focus.points.reduce((s, p) => s + (p.focusMinutes ?? 0), 0) / 60, 1);
    await send({
      category: 'review',
      type: 'weekly_review',
      title: 'Weekly review is ready',
      body: `${fmt(business.revenue)} revenue · ${hours}h focus ${ended ? 'last week' : 'this week'}`,
      url: `/reviews/weekly?week=${weekStart}`,
      dedupeKey: `weekly:${weekStart}`,
      ttl: DAY,
    });
  }
  if (due(clock.date, timeToMinutes(prefs.habitReminderTime))) {
    const [habits, done] = await Promise.all([
      Habit.find({ archived: false }).sort({ order: 1, createdAt: 1 }).lean(),
      HabitCompletion.find({ date: { $gte: bucketStart(clock.date, 'week'), $lte: clock.date } }).lean(),
    ]);
    const dates = (h) => done.filter((d) => String(d.habitId) === String(h._id)).map((d) => d.date);
    const left = habits.filter((h) => !dates(h).includes(clock.date) && dates(h).length < h.targetPerWeek);
    if (left.length) {
      await send({
        category: 'habit',
        type: 'habit_reminder',
        title: `${left.length} habit${left.length === 1 ? '' : 's'} left today`,
        body: left.map((h) => h.name).join(', '),
        url: '/today',
        dedupeKey: `habits:${clock.date}`,
        ttl: restOfDay,
      });
    }
  }
  await businessChecks(clock, due, send, prefs, restOfDay);
  return sent;
}

let loop = null;

export function startScheduler() {
  stopScheduler();
  const self = { timer: null };
  loop = self;
  const schedule = () => {
    self.timer = setTimeout(run, 60000 - (Date.now() % 60000) + 2000);
  };
  const run = async () => {
    try {
      await tick();
    } catch (err) {
      console.error(`Scheduler: ${err.message}`);
    }
    if (loop === self) schedule();
  };
  schedule();
}

export function stopScheduler() {
  clearTimeout(loop?.timer);
  loop = null;
}
