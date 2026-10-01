import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import FocusSession from '../src/models/FocusSession.js';
import Notification from '../src/models/Notification.js';
import NotificationPreference from '../src/models/NotificationPreference.js';
import { startScheduler, stopScheduler, tick } from '../src/services/scheduler.js';
import { NOW, api, create, createProduct, resetDb, setNow, setupApi } from './setup.js';

setupApi();
beforeAll(() => Notification.init());
beforeEach(resetDb);
afterEach(() => setNow(NOW));

const instant = (date, time) => new Date(`${date}T${time}:00+05:30`);
const summary = (sent) => sent.map((n) => `${n.type}: ${n.title}`);
const prefs = (body) => api.patch('/notification-preferences', body);

function at(date, time) {
  const now = instant(date, time);
  setNow(now);
  return tick(now);
}

describe('block reminders', () => {
  it('sends the before, start and end reminders once each', async () => {
    await create('/time-blocks', { name: 'Money Block', start: '10:00', end: '12:30', reminders: { beforeStart: 5, beforeEnd: 5 } });
    await api.put('/daily-outcomes/2026-09-29', { title: 'Launch Product #02' });
    expect(await at('2026-09-29', '09:54')).toEqual([]);
    expect(await at('2026-09-29', '09:55')).toMatchObject([
      {
        category: 'schedule',
        type: 'block_reminder',
        title: 'Money Block starts in 5 min',
        body: "Today's #1: Launch Product #02",
        url: '/today',
        pushed: { skipped: 'not_configured' },
      },
    ]);
    expect(await at('2026-09-29', '09:55')).toEqual([]);
    expect(await at('2026-09-29', '09:56')).toEqual([]);
    expect(await at('2026-09-29', '10:00')).toMatchObject([
      { type: 'block_start', title: 'Money Block starts now', body: "Today's priority: Launch Product #02" },
    ]);
    await prefs({ blockEnd: false });
    expect(await at('2026-09-29', '12:25')).toEqual([]);
    await prefs({ blockEnd: true });
    expect(await at('2026-09-29', '12:25')).toMatchObject([
      { type: 'block_end', title: 'Money Block ends in 5 min', body: 'Wrap up and note what moved forward.' },
    ]);
    expect(await Notification.countDocuments()).toBe(3);
  });

  it('follows the per-block settings and the global reminder switches', async () => {
    await create('/time-blocks', { name: 'Writing', start: '10:00', end: '11:00', reminders: { beforeStart: 10, atStart: false } });
    await create('/time-blocks', { name: 'Calls', start: '14:00', end: '15:00', reminders: { beforeStart: null } });
    expect(await at('2026-09-29', '09:50')).toMatchObject([{ title: 'Writing starts in 10 min', body: '10:00–11:00' }]);
    expect(await at('2026-09-29', '10:00')).toEqual([]);
    expect(await at('2026-09-29', '10:50')).toEqual([]);
    expect(await at('2026-09-29', '13:55')).toEqual([]);
    expect(await at('2026-09-29', '14:00')).toMatchObject([{ title: 'Calls starts now', body: 'Until 15:00' }]);
    await prefs({ blockReminder: false, blockStart: false });
    expect(await at('2026-09-30', '09:50')).toEqual([]);
    expect(await at('2026-09-30', '14:00')).toEqual([]);
  });

  it('catches up on reminders that are at most two minutes late', async () => {
    await create('/time-blocks', { name: 'Money Block', start: '10:00', end: '12:30' });
    expect(summary(await at('2026-09-29', '09:57'))).toEqual(['block_reminder: Money Block starts in 5 min']);
    expect(await at('2026-09-30', '09:58')).toEqual([]);
    expect(summary(await at('2026-09-30', '10:02'))).toEqual(['block_start: Money Block starts now']);
    expect(await at('2026-10-01', '10:03')).toEqual([]);
  });

  it('follows overnight blocks across midnight', async () => {
    const night = await create('/time-blocks', {
      name: 'Night launch',
      start: '23:30',
      end: '01:00',
      days: [2],
      reminders: { beforeStart: 15, beforeEnd: 10 },
    });
    const early = await create('/time-blocks', {
      name: 'Early call',
      start: '00:05',
      end: '00:35',
      days: [3],
      reminders: { beforeStart: 10 },
    });
    await prefs({ blockEnd: true });
    expect(await at('2026-09-29', '23:15')).toMatchObject([
      {
        title: 'Night launch starts in 15 min',
        dedupeKey: `block:${night._id}:2026-09-29:before:23:15`,
        pushed: { skipped: 'quiet_hours' },
      },
    ]);
    expect(summary(await at('2026-09-29', '23:30'))).toEqual(['block_start: Night launch starts now']);
    expect(await at('2026-09-29', '23:55')).toMatchObject([
      { title: 'Early call starts in 10 min', dedupeKey: `block:${early._id}:2026-09-30:before:23:55` },
    ]);
    expect(summary(await at('2026-09-30', '00:05'))).toEqual(['block_start: Early call starts now']);
    expect(await at('2026-09-30', '00:50')).toMatchObject([
      { title: 'Night launch ends in 10 min', dedupeKey: `block:${night._id}:2026-09-29:end:00:50` },
    ]);
    expect(await at('2026-09-30', '23:15')).toEqual([]);
    expect(await at('2026-10-06', '23:15')).toMatchObject([{ dedupeKey: `block:${night._id}:2026-10-06:before:23:15` }]);
  });

  it('skips disabled blocks, other weekdays and everything while notifications are off', async () => {
    await create('/time-blocks', { name: 'Paused', start: '10:00', end: '11:00', enabled: false });
    await create('/time-blocks', { name: 'Weekend', start: '10:00', end: '11:00', days: [0, 6] });
    expect(await at('2026-09-29', '09:55')).toEqual([]);
    expect(summary(await at('2026-10-03', '09:55'))).toEqual(['block_reminder: Weekend starts in 5 min']);
    await prefs({ enabled: false });
    expect(await at('2026-10-04', '09:55')).toEqual([]);
    expect(await at('2026-10-04', '10:00')).toEqual([]);
    expect(await Notification.countDocuments()).toBe(1);
  });

  it('reminds again at the new time when a block is moved later the same day', async () => {
    const block = await create('/time-blocks', { name: 'Money Block', start: '10:00', end: '12:30' });
    expect(summary(await at('2026-10-01', '09:55'))).toEqual(['block_reminder: Money Block starts in 5 min']);
    expect(summary(await at('2026-10-01', '10:00'))).toEqual(['block_start: Money Block starts now']);
    setNow(instant('2026-10-01', '10:05'));
    expect((await api.patch(`/time-blocks/${block._id}`, { start: '10:30', end: '13:00' })).status).toBe(200);
    expect(summary(await at('2026-10-01', '10:25'))).toEqual(['block_reminder: Money Block starts in 5 min']);
    expect(await at('2026-10-01', '10:26')).toEqual([]);
    expect(summary(await at('2026-10-01', '10:30'))).toEqual(['block_start: Money Block starts now']);
    expect(await at('2026-10-01', '10:31')).toEqual([]);
  });

  it('sends reminders that fall in the hour skipped by a DST change once the clock jumps, and once on the repeated hour', async () => {
    await api.patch('/settings', { timezone: 'America/New_York' });
    try {
      await create('/time-blocks', { name: 'Night shift', start: '02:30', end: '03:30', reminders: { beforeStart: 5, beforeEnd: 5 } });
      await create('/time-blocks', { name: 'Late call', start: '01:30', end: '02:30', reminders: { beforeStart: null, beforeEnd: 5 } });
      const ticks = async (...iso) => {
        const out = [];
        for (const t of iso) {
          setNow(t);
          out.push(...summary(await tick(new Date(t))));
        }
        return out.sort();
      };
      expect(await ticks('2026-03-08T06:58:00Z', '2026-03-08T06:59:00Z')).toEqual([]);
      expect(await ticks('2026-03-08T07:00:00Z', '2026-03-08T07:01:00Z')).toEqual([
        'block_end: Late call ends in 5 min',
        'block_reminder: Night shift starts in 5 min',
        'block_start: Night shift starts now',
      ]);
      expect(await ticks('2026-03-08T07:25:00Z')).toEqual(['block_end: Night shift ends in 5 min']);
      expect(await ticks('2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z')).toEqual(['block_start: Late call starts now']);
      expect(await ticks('2026-11-01T07:25:00Z', '2026-11-01T07:30:00Z')).toEqual([
        'block_end: Late call ends in 5 min',
        'block_reminder: Night shift starts in 5 min',
        'block_start: Night shift starts now',
      ]);
    } finally {
      setNow(NOW);
      await api.patch('/settings', { timezone: 'Asia/Kolkata' });
    }
  });
});

describe('daily reminders', () => {
  it('asks for the #1 outcome in the morning until it is done', async () => {
    expect(await at('2026-09-29', '08:00')).toMatchObject([
      {
        category: 'outcome',
        type: 'daily_outcome',
        title: "Set today's #1 outcome",
        body: 'Pick the one result that would make today a win.',
        url: '/today',
        dedupeKey: 'outcome:2026-09-29',
      },
    ]);
    await api.put('/daily-outcomes/2026-09-30', { title: 'Ship LP v2' });
    expect(await at('2026-09-30', '08:00')).toMatchObject([{ title: "Today's #1: Ship LP v2", body: 'Give it your first focus block.' }]);
    await api.put('/daily-outcomes/2026-10-01', { title: 'Done early', done: true });
    expect(await at('2026-10-01', '08:00')).toEqual([]);
    await prefs({ dailyOutcomeTime: '07:30' });
    expect(summary(await at('2026-10-02', '07:30'))).toEqual(["daily_outcome: Set today's #1 outcome"]);
    expect(await at('2026-10-02', '08:00')).toEqual([]);
    await prefs({ dailyOutcome: false });
    expect(await at('2026-10-03', '07:30')).toEqual([]);
  });

  it('reminds about the daily review unless it is written', async () => {
    expect(await at('2026-09-29', '22:00')).toMatchObject([
      {
        category: 'review',
        type: 'daily_review',
        title: 'Daily Review',
        body: "Record today's result and choose tomorrow's #1 outcome.",
        url: '/today?review=1',
      },
    ]);
    await api.put('/reviews/daily/2026-09-30', { accomplishment: 'Shipped' });
    expect(await at('2026-09-30', '22:00')).toEqual([]);
    await prefs({ dailyReview: false });
    expect(await at('2026-10-01', '22:00')).toEqual([]);
  });

  it("asks for tomorrow's #1 outcome after the review time, even past midnight", async () => {
    expect(await at('2026-09-29', '22:15')).toMatchObject([
      {
        category: 'outcome',
        type: 'tomorrow_outcome',
        title: "Set tomorrow's #1 outcome",
        url: '/today?review=1',
        dedupeKey: 'tomorrow:2026-09-30',
      },
    ]);
    await api.put('/daily-outcomes/2026-10-01', { title: 'Launch planner' });
    expect(await at('2026-09-30', '22:15')).toEqual([]);
    await prefs({ dailyReviewTime: '23:50' });
    expect(summary(await at('2026-10-01', '23:50'))).toEqual(['daily_review: Daily Review']);
    expect(await at('2026-10-02', '00:05')).toMatchObject([{ type: 'tomorrow_outcome', dedupeKey: 'tomorrow:2026-10-02' }]);
    expect(await at('2026-10-02', '00:06')).toEqual([]);
  });

  it('sends the weekly review on the chosen day with the week so far', async () => {
    const product = await createProduct({ name: 'Kids videos' });
    await create('/metrics', { productId: product._id, date: '2026-09-22', spend: 500, revenue: 1500, purchases: 6 });
    setNow(instant('2026-09-23', '09:00'));
    const session = await create('/focus-sessions', { plannedMinutes: 90 });
    setNow(instant('2026-09-23', '10:30'));
    await api.patch(`/focus-sessions/${session._id}`, { status: 'completed' });
    expect(await at('2026-09-27', '19:00')).toMatchObject([
      {
        category: 'review',
        type: 'weekly_review',
        title: 'Weekly review is ready',
        body: '₹1,500 revenue · 1.5h focus this week',
        url: '/reviews/weekly?week=2026-09-21',
        dedupeKey: 'weekly:2026-09-21',
      },
    ]);
    expect(await at('2026-09-28', '19:00')).toEqual([]);
    await prefs({ weeklyReviewDay: 5, weeklyReviewTime: '18:00' });
    expect(await at('2026-10-02', '18:00')).toMatchObject([{ dedupeKey: 'weekly:2026-09-28', body: '₹0 revenue · 0h focus this week' }]);
  });

  it('reviews the week that just ended when the review day is early in the week', async () => {
    const product = await createProduct({ name: 'Kids videos' });
    for (const date of ['2026-09-21', '2026-09-23', '2026-09-26']) {
      await create('/metrics', { productId: product._id, date, spend: 500, revenue: 4000, purchases: 20 });
    }
    await create('/metrics', { productId: product._id, date: '2026-09-28', revenue: 999 });
    await prefs({ weeklyReviewDay: 1, weeklyReviewTime: '09:00' });
    expect(await at('2026-09-28', '09:00')).toMatchObject([
      {
        type: 'weekly_review',
        body: '₹12,000 revenue · 0h focus last week',
        url: '/reviews/weekly?week=2026-09-21',
        dedupeKey: 'weekly:2026-09-21',
      },
    ]);
    setNow(NOW);
    await prefs({ weeklyReviewDay: 3 });
    expect(await at('2026-10-07', '09:00')).toMatchObject([
      { body: '₹999 revenue · 0h focus last week', url: '/reviews/weekly?week=2026-09-28' },
    ]);
    setNow(NOW);
    await prefs({ weeklyReviewDay: 4 });
    expect(await at('2026-10-08', '09:00')).toMatchObject([{ body: '₹0 revenue · 0h focus this week', url: '/reviews/weekly?week=2026-10-05' }]);
  });

  it('lists the habits still open at the reminder time', async () => {
    const walk = await create('/habits', { name: 'Walk' });
    const gym = await create('/habits', { name: 'Gym', targetPerWeek: 2 });
    const read = await create('/habits', { name: 'Read' });
    const old = await create('/habits', { name: 'Old habit' });
    await api.patch(`/habits/${old._id}`, { archived: true });
    expect(await at('2026-09-30', '20:00')).toEqual([]);
    await prefs({ habitReminders: true });
    await api.put(`/habits/${gym._id}/completions/2026-09-28`);
    await api.put(`/habits/${gym._id}/completions/2026-09-29`);
    await api.put(`/habits/${walk._id}/completions/2026-09-30`);
    expect(await at('2026-09-30', '20:00')).toMatchObject([
      {
        category: 'habit',
        type: 'habit_reminder',
        title: '1 habit left today',
        body: 'Read',
        url: '/today',
        dedupeKey: 'habits:2026-09-30',
      },
    ]);
    expect(await at('2026-10-01', '20:00')).toMatchObject([{ title: '2 habits left today', body: 'Walk, Read' }]);
    setNow(instant('2026-10-02', '19:00'));
    await api.put(`/habits/${walk._id}/completions/2026-10-02`);
    await api.put(`/habits/${read._id}/completions/2026-10-02`);
    expect(await at('2026-10-02', '20:00')).toEqual([]);
    expect(await at('2026-10-05', '20:00')).toMatchObject([{ title: '3 habits left today', body: 'Walk, Gym, Read' }]);
  });
});

describe('focus sessions', () => {
  it('announces the planned end and completes a forgotten session after the grace period', async () => {
    setNow(instant('2026-09-29', '10:00'));
    const session = await create('/focus-sessions', { plannedMinutes: 25, label: 'Landing page' });
    expect(await at('2026-09-29', '10:24')).toEqual([]);
    expect(await at('2026-09-29', '10:25')).toMatchObject([
      {
        category: 'focus',
        type: 'focus_end',
        title: 'Focus session complete',
        body: '25 min · Landing page',
        url: '/today',
        dedupeKey: `focus:${session._id}`,
      },
    ]);
    expect(await at('2026-09-29', '10:26')).toEqual([]);
    expect(await at('2026-09-29', '10:39')).toEqual([]);
    expect(await FocusSession.findById(session._id).lean()).toMatchObject({ status: 'running' });
    expect(await at('2026-09-29', '10:40')).toEqual([]);
    const completed = await FocusSession.findById(session._id).lean();
    expect(completed).toMatchObject({ status: 'completed', minutes: 25, endedAt: instant('2026-09-29', '10:25') });
  });

  it('completes forgotten sessions without a stale alert, even with notifications off', async () => {
    setNow(instant('2026-09-29', '10:00'));
    const quiet = await create('/focus-sessions', { plannedMinutes: 30 });
    await prefs({ enabled: false });
    expect(await at('2026-09-29', '11:00')).toEqual([]);
    const completed = await FocusSession.findById(quiet._id).lean();
    expect(completed).toMatchObject({ status: 'completed', minutes: 30, endedAt: instant('2026-09-29', '10:30') });
    await prefs({ enabled: true });
    setNow(instant('2026-09-29', '12:00'));
    const missed = await create('/focus-sessions', { plannedMinutes: 30 });
    expect(await at('2026-09-29', '12:50')).toEqual([]);
    expect(await FocusSession.findById(missed._id).lean()).toMatchObject({ status: 'completed', minutes: 30 });
    expect(await Notification.countDocuments({ type: 'focus_end' })).toBe(0);
  });

  it('respects the focus alert switch', async () => {
    await prefs({ focusEnd: false });
    setNow(instant('2026-09-29', '10:00'));
    await create('/focus-sessions', { plannedMinutes: 25 });
    expect(await at('2026-09-29', '10:25')).toEqual([]);
  });
});

describe('business checks', () => {
  it('sends the daily revenue update when there was activity', async () => {
    await prefs({ business: { dailyRevenue: true } });
    expect(await at('2026-09-29', '21:30')).toEqual([]);
    const product = await createProduct({ name: 'Kids videos' });
    await create('/metrics', { productId: product._id, date: '2026-09-30', spend: 800, revenue: 2400, purchases: 12 });
    expect(await at('2026-09-30', '21:30')).toMatchObject([
      {
        category: 'business',
        type: 'daily_revenue',
        title: 'Today: ₹2,400 revenue',
        body: '12 purchases · ₹800 ad spend · ROAS 3x',
        url: '/',
        dedupeKey: 'revenue:2026-09-30',
      },
    ]);
    await create('/metrics', { productId: product._id, date: '2026-10-01', spend: 300 });
    expect(await at('2026-10-01', '21:30')).toMatchObject([{ title: 'Today: ₹0 revenue', body: '0 purchases · ₹300 ad spend' }]);
    await prefs({ business: { dailyRevenueTime: '20:00' } });
    await create('/metrics', { productId: product._id, date: '2026-10-02', spend: 100, revenue: 900, purchases: 3 });
    expect(await at('2026-10-02', '21:30')).toEqual([]);
    expect(summary(await at('2026-10-02', '20:00'))).toEqual(['daily_revenue: Today: ₹900 revenue']);
    await prefs({ business: { dailyRevenue: false } });
    await create('/metrics', { productId: product._id, date: '2026-10-03', revenue: 500, purchases: 1 });
    expect(await at('2026-10-03', '20:00')).toEqual([]);
  });

  it("flags a sharp drop in yesterday's conversion rate at 09:00", async () => {
    await prefs({ business: { conversionDrop: true } });
    const product = await createProduct({ name: 'Planner' });
    const day = (date, landingPageViews, purchases) => create('/metrics', { productId: product._id, date, landingPageViews, purchases });
    const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];
    for (const date of week) await day(date, 200, 10);
    await day('2026-09-28', 200, 4);
    await day('2026-09-29', 200, 8);
    await day('2026-09-30', 100, 0);
    expect(await at('2026-09-29', '08:59')).toEqual([]);
    expect(await at('2026-09-29', '09:00')).toMatchObject([
      {
        category: 'business',
        type: 'conversion_drop',
        title: 'Conversion fell to 2% yesterday',
        body: 'Previous 7-day rate 5% · check where the funnel breaks',
        url: '/analytics',
        dedupeKey: 'conversion:2026-09-29',
      },
    ]);
    expect(await at('2026-09-30', '09:00')).toEqual([]);
    expect(await at('2026-10-01', '09:00')).toEqual([]);
  });

  it('warns once a day when a product spends over its daily budget', async () => {
    await prefs({ business: { adSpendThreshold: true } });
    const over = await createProduct({ name: 'Kids videos', budget: { daily: 1000 } });
    const killed = await createProduct({ name: 'Old test', status: 'killed', budget: { daily: 1000 } });
    const unbudgeted = await createProduct({ name: 'Planner' });
    const within = await createProduct({ name: 'Hooks', budget: { daily: 5000 } });
    for (const [product, spend] of [
      [over, 1200],
      [killed, 5000],
      [unbudgeted, 9000],
      [within, 4000],
    ]) {
      await create('/metrics', { productId: product._id, date: '2026-09-29', spend });
    }
    expect(await at('2026-09-29', '10:07')).toEqual([]);
    expect(await at('2026-09-29', '10:15')).toMatchObject([
      {
        category: 'business',
        type: 'ad_spend',
        title: 'Kids videos spent ₹1,200 today',
        body: 'Daily budget is ₹1,000',
        url: `/products/${over._id}`,
        dedupeKey: `spend:${over._id}:2026-09-29`,
      },
    ]);
    expect(await at('2026-09-29', '10:30')).toEqual([]);
    await prefs({ business: { adSpendThreshold: false } });
    await create('/metrics', { productId: over._id, date: '2026-09-30', spend: 1500 });
    expect(await at('2026-09-30', '10:15')).toEqual([]);
  });
});

describe('malformed VAPID keys', () => {
  const saved = { ...config.vapid };

  it('are treated as not configured and logged once, so reminders still go out', async () => {
    Object.assign(config.vapid, { publicKey: 'not-a-vapid-key', privateKey: 'short', subject: 'mailto:admin@test.local' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await create('/time-blocks', { name: 'Money Block', start: '10:00', end: '12:30' });
      expect(await at('2026-09-29', '09:55')).toMatchObject([{ type: 'block_reminder', pushed: { skipped: 'not_configured' } }]);
      expect(await at('2026-09-29', '10:00')).toMatchObject([{ type: 'block_start', pushed: { skipped: 'not_configured' } }]);
      expect((await api.get('/push/key')).body).toEqual({ configured: false, publicKey: null });
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toMatch(/VAPID/);
    } finally {
      log.mockRestore();
      Object.assign(config.vapid, saved);
    }
  });
});

describe('scheduler loop', () => {
  it('does not schedule another tick after being stopped while a tick is running', async () => {
    let fail;
    vi.spyOn(NotificationPreference, 'findOne').mockReturnValueOnce({ lean: () => new Promise((_, reject) => (fail = reject)) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const timers = [];
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn) => timers.push(fn));
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => {});
    try {
      startScheduler();
      expect(timers).toHaveLength(1);
      const running = timers.pop()();
      stopScheduler();
      fail(new Error('Database went away'));
      await running;
      expect(log).toHaveBeenCalledWith('Scheduler: Database went away');
      expect(timers).toEqual([]);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
