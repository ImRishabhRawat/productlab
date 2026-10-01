import { pctChange } from '@product-lab/shared/metrics';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import DailyOutcome from '../src/models/DailyOutcome.js';
import { MISSING_ID, NOW, api, create, createExperiment, createProduct, resetDb, setNow, setupApi } from './setup.js';

setupApi();
afterEach(() => setNow(NOW));

const ist = (date, time) => setNow(`${date}T${time}:00+05:30`);
const block = (name, start, end, body) => create('/time-blocks', { name, start, end, ...body });
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];

async function today(date, time) {
  ist(date, time);
  const res = await api.get('/productivity/today');
  expect(res.status).toBe(200);
  return res.body;
}

async function focus(body, date, time, minutes, status = 'completed') {
  ist(date, time);
  const session = await create('/focus-sessions', { plannedMinutes: 90, ...body });
  setNow(new Date(Date.now() + minutes * 60_000).toISOString());
  await api.patch(`/focus-sessions/${session._id}`, { status });
  return session;
}

describe('today', () => {
  let blocks;
  let kids;

  beforeAll(async () => {
    await resetDb();
    ist('2026-09-01', '09:00');
    blocks = {
      morning: await block('Morning', '06:00', '06:15', { category: 'personal' }),
      money: await block('Money Block', '10:00', '12:30', { category: 'business' }),
      lunch: await block('Break', '12:30', '13:00', { category: 'break' }),
      gym: await block('Gym', '18:00', '19:15', { category: 'fitness', days: [1, 2, 3, 4, 5, 6] }),
      launch: await block('Night launch', '23:00', '01:00', { category: 'product', days: [2] }),
      paused: await block('Paused', '14:00', '15:00', { enabled: false }),
      weekend: await block('Weekend', '09:00', '10:00', { days: [0, 6] }),
    };
    const walk = await create('/habits', { name: 'Walk' });
    await create('/habits', { name: 'Gym', targetPerWeek: 4 });
    const reading = await create('/habits', { name: 'Reading' });
    await api.patch(`/habits/${reading._id}`, { archived: true });
    ist('2026-09-29', '09:00');
    await api.put(`/habits/${walk._id}/completions/2026-09-29`);
    await api.put(`/habits/${reading._id}/completions/2026-09-29`);
    const completedBlocks = [blocks.money._id, blocks.lunch._id];
    await api.put('/daily-outcomes/2026-09-29', { title: 'Launch test', done: true, completedBlocks });
    kids = await createProduct({ name: 'Kids videos', status: 'scaling' });
    const scale = await createExperiment(kids._id, { name: 'Scale', status: 'running' });
    await create('/metrics', { experimentId: scale._id, date: '2026-09-29', spend: 500, revenue: 1500, purchases: 5 });
    await create('/metrics', { experimentId: scale._id, date: '2026-09-25', spend: 400, revenue: 1000, purchases: 4 });
  });

  it('shows the current and next block, the day score and the business snapshot', async () => {
    const body = await today('2026-09-29', '11:00');
    expect(body).toMatchObject({ date: '2026-09-29', timezone: 'Asia/Kolkata', now: { time: '11:00', minutes: 660, weekday: 2 } });
    expect(body.blocks.map((b) => [b.name, b.state, b.completed])).toEqual([
      ['Morning', 'past', false],
      ['Money Block', 'current', true],
      ['Break', 'upcoming', true],
      ['Gym', 'upcoming', false],
      ['Night launch', 'upcoming', false],
    ]);
    expect(body.blocks[4]).toEqual({
      _id: blocks.launch._id,
      name: 'Night launch',
      start: '23:00',
      end: '01:00',
      category: 'product',
      goalId: null,
      productId: null,
      minutes: 120,
      state: 'upcoming',
      completed: false,
    });
    expect(body.current).toMatchObject({ _id: blocks.money._id, name: 'Money Block', minutes: 150, state: 'current', remaining: 90 });
    expect(body.next).toMatchObject({ _id: blocks.lunch._id, startsIn: 90 });
    expect(body.outcome).toMatchObject({ title: 'Launch test', done: true });
    expect(body.habits).toEqual([
      { _id: expect.any(String), name: 'Walk', targetPerWeek: 7, done: true },
      { _id: expect.any(String), name: 'Gym', targetPerWeek: 4, done: false },
    ]);
    expect(body.progress).toEqual({
      outcomeSet: true,
      outcomeDone: true,
      blocksTotal: 4,
      blocksDone: 1,
      habitsTotal: 2,
      habitsDone: 1,
      score: 58,
    });
    expect(body.focus).toEqual({ running: null, minutesToday: 0 });
    expect(body.review).toBeNull();
    expect(body.business).toEqual({
      revenue: 1500,
      spend: 500,
      purchases: 5,
      roas: 3,
      activeExperiments: 1,
      topProduct: { _id: kids._id, name: 'Kids videos', revenue: 2500, status: 'scaling' },
    });
  });

  it('keeps an overnight block current after midnight', async () => {
    const late = await today('2026-09-29', '23:30');
    expect(late.current).toMatchObject({ name: 'Night launch', state: 'current', remaining: 90 });
    expect(late.next).toBeNull();
    const after = await today('2026-09-30', '00:30');
    expect(after).toMatchObject({ date: '2026-09-30', now: { time: '00:30', minutes: 30, weekday: 3 }, outcome: null });
    expect(after.blocks.map((b) => [b.name, b.state])).toEqual([
      ['Morning', 'upcoming'],
      ['Money Block', 'upcoming'],
      ['Break', 'upcoming'],
      ['Gym', 'upcoming'],
    ]);
    expect(after.current).toMatchObject({ _id: blocks.launch._id, state: 'current', remaining: 30 });
    expect(after.next).toMatchObject({ name: 'Morning', startsIn: 330 });
    expect(after.progress).toMatchObject({ outcomeSet: false, blocksTotal: 3, blocksDone: 0, habitsDone: 0 });
    expect((await today('2026-09-30', '01:00')).current).toBeNull();
  });

  it('marks a daily overnight block current in the list and prefers the latest start', async () => {
    ist('2026-09-01', '09:00');
    const reading = await block('Reading', '22:30', '00:45', { category: 'learning' });
    try {
      const thursday = await today('2026-10-01', '00:15');
      expect(thursday.blocks.find((b) => b.name === 'Reading')).toMatchObject({ state: 'current' });
      expect(thursday.current).toMatchObject({ name: 'Reading', remaining: 30 });
      expect(thursday.next).toMatchObject({ name: 'Morning' });
      expect((await today('2026-09-30', '00:15')).current).toMatchObject({ name: 'Night launch', remaining: 45 });
      expect((await today('2026-10-01', '22:40')).current).toMatchObject({ name: 'Reading', remaining: 125 });
    } finally {
      await api.delete(`/time-blocks/${reading._id}`);
    }
  });

  it("counts today's focus minutes, including a running session", async () => {
    await focus({ label: 'Morning focus' }, '2026-09-29', '09:00', 45);
    await focus({ label: 'Late night' }, '2026-09-28', '23:50', 20);
    await focus({ label: 'Dropped' }, '2026-09-29', '10:00', 15, 'cancelled');
    ist('2026-09-29', '10:30');
    const running = await create('/focus-sessions', { plannedMinutes: 60, label: 'Deep work' });
    try {
      const body = await today('2026-09-29', '11:00');
      expect(body.focus).toMatchObject({ running: { _id: running._id, label: 'Deep work', status: 'running' }, minutesToday: 75 });
      expect((await today('2026-09-29', '12:00')).focus.minutesToday).toBe(105);
    } finally {
      await api.delete(`/focus-sessions/${running._id}`);
    }
  });

  it('follows the configured timezone', async () => {
    await api.patch('/settings', { timezone: 'America/New_York' });
    try {
      const body = await today('2026-09-29', '12:00');
      expect(body).toMatchObject({
        date: '2026-09-29',
        timezone: 'America/New_York',
        now: { time: '02:30', minutes: 150, weekday: 2 },
        current: null,
      });
      expect(body.next).toMatchObject({ name: 'Morning', startsIn: 210 });
      expect((await today('2026-09-30', '05:00')).date).toBe('2026-09-29');
    } finally {
      await api.patch('/settings', { timezone: 'Asia/Kolkata' });
    }
  });

  it("includes today's review", async () => {
    await api.put('/reviews/daily/2026-09-29', { accomplishment: 'Launched the test' });
    expect((await today('2026-09-29', '22:30')).review).toMatchObject({ date: '2026-09-29', accomplishment: 'Launched the test' });
  });

  it('does not keep a block from yesterday current unless it runs past midnight', async () => {
    const monday = await today('2026-09-28', '09:30');
    expect(monday.current).toBeNull();
    expect(monday.next).toMatchObject({ name: 'Money Block', startsIn: 30 });
    expect((await today('2026-09-30', '23:30')).current).toBeNull();
    expect((await today('2026-09-30', '00:30')).current).toMatchObject({ name: 'Night launch', remaining: 30 });
  });

  it('names the goal, product and experiment of the outcome and the running focus session', async () => {
    ist('2026-09-29', '09:00');
    const goal = await create('/goals', { title: 'Build savings', level: 'yearly', category: 'money' });
    const offer = await createExperiment(kids._id, { name: '₹199 offer test' });
    const links = { goalId: goal._id, productId: kids._id, experimentId: offer._id };
    await api.put('/daily-outcomes/2026-09-29', links);
    const running = await create('/focus-sessions', { plannedMinutes: 60, label: 'Landing page', ...links });
    try {
      const body = await today('2026-09-29', '09:30');
      const names = { goalTitle: 'Build savings', productName: 'Kids videos', experimentName: '₹199 offer test' };
      expect(body.outcome).toMatchObject({ title: 'Launch test', ...links, ...names });
      expect(body.focus.running).toMatchObject({ _id: running._id, status: 'running', ...links, ...names });
      await api.put('/daily-outcomes/2026-09-29', { goalId: null, productId: null, experimentId: null });
      expect((await today('2026-09-29', '09:31')).outcome).toMatchObject({ goalTitle: '', productName: '', experimentName: '' });
    } finally {
      await api.delete(`/focus-sessions/${running._id}`);
      await api.delete(`/experiments/${offer._id}`);
      await api.delete(`/goals/${goal._id}`);
    }
  });

  it("leaves a habit out of today's progress once its weekly target is met, unless it is done today", async () => {
    const gym = (await api.get('/habits')).body.items.find((h) => h.name === 'Gym');
    const days = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01'];
    ist('2026-10-02', '09:00');
    for (const date of days) await api.put(`/habits/${gym._id}/completions/${date}`);
    try {
      expect((await today('2026-10-02', '10:00')).progress).toMatchObject({ habitsTotal: 1, habitsDone: 0 });
      await api.put(`/habits/${gym._id}/completions/2026-10-02`);
      expect((await today('2026-10-02', '10:00')).progress).toMatchObject({ habitsTotal: 2, habitsDone: 1 });
    } finally {
      for (const date of [...days, '2026-10-02']) await api.delete(`/habits/${gym._id}/completions/${date}`);
    }
  });
});

describe('series', () => {
  let kids;
  let planner;

  beforeAll(async () => {
    await resetDb();
    ist('2026-09-01', '09:00');
    const deep = await block('Deep work', '10:00', '12:00', { category: 'business' });
    const lunch = await block('Lunch', '13:00', '13:30', { category: 'break' });
    const gym = await block('Gym', '18:00', '19:00', { category: 'fitness', days: [1, 3, 5] });
    await block('Paused', '15:00', '16:00', { enabled: false });
    const walk = await create('/habits', { name: 'Walk' });
    const read = await create('/habits', { name: 'Read', targetPerWeek: 5 });
    const old = await create('/habits', { name: 'Old habit' });
    kids = await createProduct({ name: 'Kids videos', costs: { paymentFeePct: 0 } });
    planner = await createProduct({ name: 'Planner', costs: { paymentFeePct: 0 } });
    ist('2026-09-25', '09:00');
    const review = await block('Review', '21:00', '21:15', { category: 'review' });
    const stretch = await create('/habits', { name: 'Stretch' });

    ist('2026-09-29', '12:00');
    const complete = (habit, dates) => Promise.all(dates.map((date) => api.put(`/habits/${habit._id}/completions/${date}`)));
    await complete(walk, ['2026-09-21', '2026-09-22', '2026-09-23']);
    await complete(read, ['2026-09-21']);
    await complete(stretch, ['2026-09-23']);
    await complete(old, ['2026-09-21', '2026-09-22']);
    await api.patch(`/habits/${old._id}`, { archived: true });

    await api.put('/daily-outcomes/2026-09-21', { title: 'A', done: true, completedBlocks: [deep._id, lunch._id, gym._id] });
    await api.put('/daily-outcomes/2026-09-22', { title: 'B', completedBlocks: [deep._id, gym._id] });
    await api.put('/daily-outcomes/2026-09-24', { tasks: [{ title: 'Untitled day' }] });
    await api.put('/daily-outcomes/2026-09-25', { title: 'C', done: true, completedBlocks: [review._id, MISSING_ID] });

    await focus({ productId: kids._id, category: 'business' }, '2026-09-21', '10:00', 90);
    await focus({ category: 'learning' }, '2026-09-22', '00:30', 30);
    await focus({ productId: kids._id }, '2026-09-23', '10:00', 20, 'cancelled');
    await focus({ productId: planner._id, category: 'product' }, '2026-09-26', '11:00', 45);
    await focus({ productId: planner._id }, '2026-09-28', '10:00', 60);
    setNow(NOW);

    await createExperiment(kids._id, { name: 'Price test', status: 'completed', startDate: '2026-09-10', endDate: '2026-09-24' });
    await createExperiment(kids._id, { name: 'Later test', status: 'completed', startDate: '2026-09-10', endDate: '2026-09-30' });
    await createExperiment(planner._id, { name: 'Still running', status: 'running', startDate: '2026-09-20' });
    await create('/metrics', { productId: kids._id, date: '2026-09-22', spend: 400, revenue: 1000, purchases: 4 });
    await create('/metrics', { productId: planner._id, date: '2026-09-26', spend: 100, revenue: 500, purchases: 2 });
  });

  it('builds daily points in the configured timezone', async () => {
    const res = await api.get('/productivity/series?from=2026-09-21&to=2026-09-27&granularity=day');
    expect(res.status).toBe(200);
    const { from, to, granularity, points, focusByProduct, focusByCategory } = res.body;
    expect({ from, to, granularity }).toEqual({ from: '2026-09-21', to: '2026-09-27', granularity: 'day' });
    const pick = (...keys) => points.map((p) => keys.map((k) => p[k]));
    expect(points.map((p) => p.key)).toEqual(WEEK);
    expect(pick('focusMinutes', 'focusHours', 'sessions')).toEqual([
      [90, 1.5, 1],
      [30, 0.5, 1],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [45, 0.75, 1],
      [0, 0, 0],
    ]);
    expect(pick('outcomeSet', 'outcomeDone')).toEqual([
      [1, 1],
      [1, 0],
      [0, 0],
      [0, 0],
      [1, 1],
      [0, 0],
      [0, 0],
    ]);
    expect(pick('blocksScheduled', 'blocksCompleted', 'blockRate')).toEqual([
      [2, 2, 100],
      [1, 1, 100],
      [2, 0, 0],
      [1, 0, 0],
      [3, 1, 33.3],
      [2, 0, 0],
      [2, 0, 0],
    ]);
    expect(pick('habitsDone', 'habitsPossible', 'habitRate')).toEqual([
      [2, 2, 100],
      [1, 1, 100],
      [2, 2, 100],
      [0, 3, 0],
      [0, 3, 0],
      [0, 3, 0],
      [0, 3, 0],
    ]);
    expect(pick('experimentsCompleted').flat()).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(pick('revenue', 'spend', 'purchases', 'contribution')).toEqual([
      [0, 0, 0, 0],
      [1000, 400, 4, 600],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [500, 100, 2, 400],
      [0, 0, 0, 0],
    ]);
    expect(focusByProduct).toEqual([
      { _id: kids._id, name: 'Kids videos', hours: 1.5 },
      { _id: planner._id, name: 'Planner', hours: 0.75 },
    ]);
    expect(focusByCategory).toEqual([
      { category: 'business', hours: 1.5 },
      { category: 'product', hours: 0.75 },
      { category: 'learning', hours: 0.5 },
    ]);
  });

  it('rolls days up into weeks', async () => {
    const { granularity, points } = (await api.get('/productivity/series?from=2026-09-21&to=2026-09-27&granularity=week')).body;
    expect(granularity).toBe('week');
    expect(points).toEqual([
      {
        key: '2026-09-21',
        focusMinutes: 165,
        focusHours: 2.75,
        sessions: 3,
        outcomeSet: 3,
        outcomeDone: 2,
        blocksScheduled: 13,
        blocksCompleted: 4,
        blockRate: 30.8,
        habitsDone: 5,
        habitsPossible: 17,
        habitRate: 29.4,
        experimentsCompleted: 1,
        revenue: 1500,
        spend: 500,
        purchases: 6,
        contribution: 1000,
      },
    ]);
  });

  it('starts all time at the first recorded day and keeps every total on long ranges', async () => {
    const recent = (await api.get('/productivity/series')).body;
    expect(recent).toMatchObject({ from: '2026-09-21', to: '2026-09-29', granularity: 'day' });
    expect(recent.points).toHaveLength(9);
    await create('/metrics', { productId: kids._id, date: '2026-10-01', revenue: 700 });
    const long = (await api.get('/productivity/series?from=2024-01-01&to=2026-10-31')).body;
    expect(long.granularity).toBe('month');
    const month = (key) => long.points.find((p) => p.key === key);
    expect([month('2026-09-01').revenue, month('2026-10-01').revenue]).toEqual([1500, 700]);
    const total = (key) => long.points.reduce((s, p) => s + p[key], 0);
    expect(['revenue', 'spend', 'focusMinutes', 'blocksCompleted', 'habitsDone'].map(total)).toEqual([2200, 500, 225, 4, 5]);
    expect((await api.get('/productivity/series?granularity=hour')).body).toEqual({
      error: { message: 'Invalid filters', fields: { granularity: 'Choose a valid option' } },
    });
  });

  it('leaves days that have not happened yet out of the counts and rates', async () => {
    await api.put('/daily-outcomes/2026-09-30', { title: 'Planned for tomorrow' });
    const { points } = (await api.get('/productivity/series?from=2026-09-28&to=2026-10-04&granularity=day')).body;
    expect(points.map((p) => [p.key, p.blocksScheduled, p.habitsPossible, p.outcomeSet, p.blockRate, p.habitRate])).toEqual([
      ['2026-09-28', 3, 2, 0, 0, 0],
      ['2026-09-29', 2, 2, 0, 0, 0],
      ['2026-09-30', 0, 0, 0, null, null],
      ['2026-10-01', 0, 0, 0, null, null],
      ['2026-10-02', 0, 0, 0, null, null],
      ['2026-10-03', 0, 0, 0, null, null],
      ['2026-10-04', 0, 0, 0, null, null],
    ]);
    const thisWeek = (await api.get('/reviews/weekly')).body.productivity.current;
    expect(thisWeek).toMatchObject({ outcomesSet: 0, blocksScheduled: 5, habitsPossible: 4 });
  });

  it('summarises a week for the weekly review', async () => {
    await api.put('/reviews/weekly/2026-09-21', { wins: 'Two launches' });
    const res = await api.get('/reviews/weekly?start=2026-09-24');
    expect(res.status).toBe(200);
    const week = res.body;
    expect(week).toMatchObject({ weekStart: WEEK[0], weekEnd: WEEK[6], review: { weekStart: WEEK[0], wins: 'Two launches' } });
    expect(week.business).toMatchObject({
      range: { from: '2026-09-21', to: '2026-09-27' },
      previousRange: { from: '2026-09-14', to: '2026-09-20' },
      current: { revenue: 1500, spend: 500, purchases: 6, contribution: 1000, cac: 83.33, roas: 3 },
      previous: { revenue: 0, spend: 0 },
      change: { revenue: null },
      experimentsCompleted: 1,
      experiments: [{ name: 'Price test', productId: kids._id, endDate: '2026-09-24' }],
    });
    expect(week.productivity.current).toEqual({
      focusHours: 2.75,
      sessions: 3,
      outcomesSet: 3,
      outcomesDone: 2,
      blocksScheduled: 13,
      blocksCompleted: 4,
      habitsDone: 5,
      habitsPossible: 17,
      experimentsCompleted: 1,
    });
    expect(week.productivity.previous).toEqual({
      focusHours: 0,
      sessions: 0,
      outcomesSet: 0,
      outcomesDone: 0,
      blocksScheduled: 10,
      blocksCompleted: 0,
      habitsDone: 0,
      habitsPossible: 12,
      experimentsCompleted: 0,
    });
    expect(week.productivity.points.map((p) => p.key)).toEqual(WEEK);
    expect(week.focusByProduct.map((p) => [p.name, p.hours])).toEqual([
      ['Kids videos', 1.5],
      ['Planner', 0.75],
    ]);
    expect(week.habits).toEqual([
      { _id: expect.any(String), name: 'Walk', targetPerWeek: 7, done: 3, dates: ['2026-09-21', '2026-09-22', '2026-09-23'] },
      { _id: expect.any(String), name: 'Read', targetPerWeek: 5, done: 1, dates: ['2026-09-21'] },
      { _id: expect.any(String), name: 'Stretch', targetPerWeek: 7, done: 1, dates: ['2026-09-23'] },
    ]);
  });

  it('compares a week in progress with the same days of the previous week', async () => {
    const dates = { startDate: '2026-09-15', endDate: '2026-09-22' };
    const quick = await createExperiment(kids._id, { name: 'Quick test', status: 'completed', ...dates });
    try {
      const { business } = (await api.get('/reviews/weekly')).body;
      expect(business).toMatchObject({
        range: { from: '2026-09-28', to: '2026-10-04' },
        previousRange: { from: '2026-09-21', to: '2026-09-22' },
        previous: { revenue: 1000, spend: 400, purchases: 4 },
        change: { spend: -100, purchases: -100 },
        experimentsCompleted: 1,
        previousExperimentsCompleted: 1,
      });
      expect(business.change.revenue).toBe(pctChange(business.current.revenue, 1000));
      const past = (await api.get('/reviews/weekly?start=2026-09-21')).body.business;
      expect(past).toMatchObject({
        previousRange: { from: '2026-09-14', to: '2026-09-20' },
        experimentsCompleted: 2,
        previousExperimentsCompleted: 0,
      });
    } finally {
      await api.delete(`/experiments/${quick._id}`);
    }
  });

  it('compares a week in progress only through its last recorded day', async () => {
    const metric = await create('/metrics', { productId: kids._id, date: '2026-09-28', spend: 200, revenue: 600, purchases: 2 });
    setNow('2026-09-30T06:30:00.000Z');
    try {
      const { business } = (await api.get('/reviews/weekly')).body;
      expect(business.previousRange).toEqual({ from: '2026-09-21', to: '2026-09-21' });
    } finally {
      setNow(NOW);
      await api.delete(`/metrics/${metric._id}`);
    }
  });

  it('names the product of each finished experiment and lists only habits that existed that week', async () => {
    const week = (start) => api.get(`/reviews/weekly?start=${start}`).then((res) => res.body);
    expect((await week('2026-09-21')).business.experiments).toEqual([
      { _id: expect.any(String), name: 'Price test', productId: kids._id, productName: 'Kids videos', endDate: '2026-09-24' },
    ]);
    expect((await week('2026-09-14')).habits.map((h) => h.name)).toEqual(['Walk', 'Read']);
    ist('2026-09-29', '12:00');
    const backfilled = await create('/habits', { name: 'Backfilled' });
    await api.put(`/habits/${backfilled._id}/completions/2026-09-10`);
    try {
      const earlier = await week('2026-09-07');
      expect(earlier.habits.map((h) => [h.name, h.done])).toEqual([
        ['Walk', 0],
        ['Read', 0],
        ['Backfilled', 1],
      ]);
      expect(earlier.productivity.current).toMatchObject({ habitsDone: 1, habitsPossible: 16 });
      const later = await week('2026-09-14');
      expect(later.habits.map((h) => h.name)).toEqual(['Walk', 'Read', 'Backfilled']);
      expect(later.productivity.current).toMatchObject({ habitsDone: 0, habitsPossible: 19 });
      expect((await week('2026-08-31')).habits.map((h) => h.name)).toEqual(['Walk', 'Read']);
    } finally {
      await api.delete(`/habits/${backfilled._id}`);
    }
  });

  it('narrows the focus figures to one goal or one product', async () => {
    const range = 'from=2026-09-21&to=2026-09-27&granularity=week';
    const byProduct = (await api.get(`/productivity/series?${range}&productId=${planner._id}`)).body;
    expect(byProduct.points[0]).toMatchObject({ focusMinutes: 45, sessions: 1, revenue: 1500 });
    expect(byProduct.focusByProduct).toEqual([{ _id: planner._id, name: 'Planner', hours: 0.75 }]);
    const goal = await create('/goals', { title: 'Learn ads', level: 'monthly', category: 'learning' });
    const session = await focus({ goalId: goal._id, category: 'learning' }, '2026-09-24', '08:00', 40);
    try {
      const byGoal = (await api.get(`/productivity/series?${range}&goalId=${goal._id}`)).body;
      expect(byGoal.points[0]).toMatchObject({ focusMinutes: 40, sessions: 1 });
      expect(byGoal.focusByCategory).toEqual([{ category: 'learning', hours: 0.67 }]);
      expect((await api.get('/productivity/series?goalId=abc')).body.error.fields).toEqual({ goalId: 'Invalid id' });
    } finally {
      await api.delete(`/focus-sessions/${session._id}`);
      await api.delete(`/goals/${goal._id}`);
    }
  });
});

describe('habit targets', () => {
  beforeAll(async () => {
    await resetDb();
    ist('2026-09-01', '09:00');
    const walk = await create('/habits', { name: 'Walk' });
    const gym = await create('/habits', { name: 'Gym', targetPerWeek: 4 });
    setNow(NOW);
    for (const date of WEEK) await api.put(`/habits/${walk._id}/completions/${date}`);
    for (const date of WEEK.slice(3)) await api.put(`/habits/${gym._id}/completions/${date}`);
  });

  it('reaches 100% in a week where every weekly target is met', async () => {
    const range = 'from=2026-09-21&to=2026-09-27';
    expect((await api.get(`/productivity/series?${range}&granularity=week`)).body.points[0]).toMatchObject({
      habitsDone: 11,
      habitsPossible: 11,
      habitRate: 100,
    });
    const days = (await api.get(`/productivity/series?${range}&granularity=day`)).body.points;
    expect(days.map((p) => [p.habitsDone, p.habitsPossible])).toEqual([
      [1, 1],
      [1, 1],
      [1, 1],
      [2, 2],
      [2, 2],
      [2, 2],
      [2, 2],
    ]);
    const review = (await api.get('/reviews/weekly?start=2026-09-21')).body;
    expect(review.productivity.current).toMatchObject({ habitsDone: 11, habitsPossible: 11 });
  });

  it('counts a missed check-in only once the weekly target can no longer be met', async () => {
    const days = (await api.get('/productivity/series?from=2026-09-28&to=2026-09-30&granularity=day')).body.points;
    expect(days.map((p) => [p.key, p.habitsDone, p.habitsPossible, p.habitRate])).toEqual([
      ['2026-09-28', 0, 1, 0],
      ['2026-09-29', 0, 1, 0],
      ['2026-09-30', 0, 0, null],
    ]);
  });
});

describe('schedule history', () => {
  let blocks;

  beforeAll(async () => {
    await resetDb();
    ist('2026-09-01', '09:00');
    blocks = {
      deep: await block('Deep work', '10:00', '12:00', { category: 'business' }),
      gym: await block('Gym', '18:00', '19:00', { category: 'fitness', days: [1, 3, 5, 6] }),
      calls: await block('Calls', '15:00', '16:00', { category: 'business', days: [1, 2, 3, 4, 5] }),
    };
    setNow(NOW);
    await api.put('/daily-outcomes/2026-09-21', { completedBlocks: [blocks.deep._id, blocks.gym._id, blocks.calls._id] });
    await api.put('/daily-outcomes/2026-09-23', { completedBlocks: [blocks.gym._id] });
  });

  it('keeps past days as they were when blocks are switched off, moved to other days or deleted', async () => {
    const week = async () => (await api.get('/productivity/series?from=2026-09-21&to=2026-09-27&granularity=week')).body.points[0];
    const before = await week();
    expect(before).toMatchObject({ blocksScheduled: 16, blocksCompleted: 4 });
    await api.patch(`/time-blocks/${blocks.gym._id}`, { enabled: false });
    await api.patch(`/time-blocks/${blocks.calls._id}`, { days: [0, 6] });
    expect((await api.delete(`/time-blocks/${blocks.deep._id}`)).status).toBe(204);
    expect(await week()).toEqual(before);
    const thisWeek = (await api.get('/productivity/series?from=2026-09-28&to=2026-09-29&granularity=day')).body.points;
    expect(thisWeek.map((p) => p.blocksScheduled)).toEqual([3, 0]);
  });
});

describe('all time', () => {
  beforeAll(resetDb);

  it('starts at the first recorded focus session, outcome, habit check-in or ad metric', async () => {
    const series = async (query = '') => {
      setNow(NOW);
      return (await api.get(`/productivity/series${query}`)).body;
    };
    expect(await series()).toMatchObject({ from: '2026-09-29', to: '2026-09-29', granularity: 'day', points: [{ key: '2026-09-29' }] });
    const product = await createProduct({ name: 'Kids videos' });
    await create('/metrics', { productId: product._id, date: '2026-09-01', revenue: 900 });
    expect(await series()).toMatchObject({ from: '2026-09-01', to: '2026-09-29', granularity: 'day' });
    ist('2026-08-01', '09:00');
    const walk = await create('/habits', { name: 'Walk' });
    setNow(NOW);
    await api.put(`/habits/${walk._id}/completions/2026-08-15`);
    expect((await series()).from).toBe('2026-08-15');
    await api.put('/daily-outcomes/2026-07-01', { title: 'Old plan' });
    expect(await series()).toMatchObject({ from: '2026-07-01', granularity: 'week' });
    await focus({ label: 'Dropped' }, '2026-06-01', '09:00', 10, 'cancelled');
    expect((await series()).from).toBe('2026-07-01');
    await focus({ label: 'Early' }, '2026-06-15', '00:30', 30);
    const all = await series();
    expect(all).toMatchObject({ from: '2026-06-15', to: '2026-09-29', granularity: 'week' });
    expect(all.points[0]).toMatchObject({ key: '2026-06-15', focusMinutes: 30, revenue: 0 });
    expect(all.points.reduce((s, p) => s + p.revenue, 0)).toBe(900);
    expect(await series('?to=2026-06-20')).toMatchObject({ from: '2026-06-15', to: '2026-06-20', granularity: 'day' });
    expect(await series('?to=2026-06-10')).toMatchObject({ from: '2026-06-10', to: '2026-06-10' });
  });

  it('looks back at most ten years and refuses longer ranges', async () => {
    setNow(NOW);
    expect((await api.get('/productivity/series?from=2000-01-01&to=2026-09-29')).body).toEqual({
      error: { message: 'Invalid filters', fields: { from: 'Choose a range of at most 10 years' } },
    });
    await DailyOutcome.create({ date: '1990-01-01', title: 'Typo year' });
    expect((await api.get('/productivity/series')).body).toMatchObject({ from: '2016-09-22', to: '2026-09-29', granularity: 'month' });
  });
});
