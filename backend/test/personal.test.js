import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import FocusSession from '../src/models/FocusSession.js';
import Goal from '../src/models/Goal.js';
import { MISSING_ID, NOW, api, create, createExperiment, createProduct, setNow, setupApi } from './setup.js';

setupApi();
afterEach(() => setNow(NOW));

const ist = (date, time) => setNow(`${date}T${time}:00+05:30`);
const fieldError = (fields) => ({ error: { message: 'Please fix the highlighted fields', fields } });
const goal = (body) => create('/goals', { title: 'Goal', level: 'monthly', category: 'money', ...body });
const EMPTY_OUTCOME = { title: '', done: false, tasks: [], completedBlocks: [] };

async function focus(body, start, minutes, status = 'completed') {
  setNow(start);
  const session = await create('/focus-sessions', { plannedMinutes: 60, ...body });
  setNow(new Date(Date.parse(start) + minutes * 60_000).toISOString());
  const res = await api.patch(`/focus-sessions/${session._id}`, { status });
  expect(res.status).toBe(200);
  return res.body;
}

describe('goals', () => {
  let kids;
  let planner;

  beforeAll(async () => {
    const costs = { paymentFeePct: 2, refundRatePct: 0, variableCostPerSale: 0 };
    kids = await createProduct({ name: 'Kids videos', costs });
    planner = await createProduct({ name: 'Planner', costs });
    const metric = (product, date, spend, revenue, purchases) =>
      create('/metrics', { productId: product._id, date, spend, revenue, purchases });
    await metric(kids, '2026-09-01', 100, 1000, 4);
    await metric(kids, '2026-09-20', 200, 500, 2);
    await metric(planner, '2026-09-21', 0, 300, 1);
    await metric(kids, '2026-10-05', 50, 900, 3);
  });

  it('creates a goal with its computed progress and linked products', async () => {
    const res = await api.post('/goals', {
      title: ' Launch revenue ',
      level: 'monthly',
      category: 'money',
      tracking: 'revenue',
      targetValue: 1600,
      unit: 'INR',
      startDate: '2026-09-10',
      targetDate: '2026-09-30',
      productIds: [kids._id, planner._id],
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'Launch revenue',
      description: '',
      status: 'active',
      achievedAt: null,
      currentValue: null,
      current: 800,
      progress: 50,
      focusHours: 0,
      daysLeft: 1,
      products: [
        { _id: kids._id, name: 'Kids videos', status: 'ready_to_test' },
        { _id: planner._id, name: 'Planner', status: 'ready_to_test' },
      ],
    });
    expect((await api.get(`/goals/${res.body._id}`)).body).toMatchObject({ current: 800, progress: 50 });
  });

  it.each([
    ['revenue', 1600, 800, 50],
    ['purchases', 10, 3, 30],
    ['contribution', 1000, 584, 58.4],
  ])('sums %s from linked products inside the goal window', async (tracking, targetValue, current, progress) => {
    const window = { startDate: '2026-09-10', targetDate: '2026-09-30', productIds: [kids._id, planner._id] };
    expect(await goal({ tracking, targetValue, ...window })).toMatchObject({ current, progress });
  });

  it('stops at the target date and starts at creation without a start date', async () => {
    const ended = await goal({
      tracking: 'revenue',
      targetValue: 1000,
      startDate: '2026-09-01',
      targetDate: '2026-09-15',
      productIds: [kids._id],
    });
    expect(ended).toMatchObject({ current: 1000, progress: 100, daysLeft: -14 });
    const legacy = await Goal.create({
      title: 'Goal',
      level: 'monthly',
      category: 'money',
      tracking: 'revenue',
      targetValue: 500,
      startDate: '2026-09-01',
    });
    const unlinked = (await api.get(`/goals/${legacy._id}`)).body;
    expect(unlinked).toMatchObject({ current: 0, progress: 0, products: [] });
    setNow('2026-09-15T06:30:00.000Z');
    const fresh = await goal({ tracking: 'revenue', targetValue: 1000, productIds: [kids._id] });
    expect(fresh).toMatchObject({ startDate: null, current: 0, progress: 0 });
    setNow(NOW);
    expect((await api.get(`/goals/${fresh._id}`)).body).toMatchObject({ current: 500, progress: 50 });
  });

  it('keeps manual values as entered', async () => {
    const manual = await goal({ category: 'fitness', currentValue: 3, targetValue: 12, unit: 'kg' });
    expect(manual).toMatchObject({ tracking: 'manual', current: 3, progress: 25, focusHours: 0 });
    expect((await api.patch(`/goals/${manual._id}`, { currentValue: 15 })).body).toMatchObject({ current: 15, progress: 100 });
    expect(await goal({ title: 'Read more' })).toMatchObject({ current: null, progress: null, daysLeft: null });
  });

  it('counts completed focus hours logged against the goal inside its window', async () => {
    const learning = await goal({
      category: 'learning',
      tracking: 'focus_hours',
      targetValue: 10,
      startDate: '2026-09-20',
      targetDate: '2026-10-31',
    });
    const other = await goal({ category: 'learning', tracking: 'focus_hours', targetValue: 10, startDate: '2026-09-01' });
    await focus({ goalId: learning._id }, '2026-09-25T09:00:00+05:30', 90);
    await focus({ goalId: learning._id }, '2026-09-26T09:00:00+05:30', 30);
    await focus({ goalId: learning._id }, '2026-09-27T09:00:00+05:30', 45, 'cancelled');
    await focus({ goalId: learning._id }, '2026-09-15T09:00:00+05:30', 60);
    await focus({ goalId: other._id }, '2026-09-26T10:00:00+05:30', 30);
    setNow(NOW);
    expect((await api.get(`/goals/${learning._id}`)).body).toMatchObject({ current: 2, progress: 20, focusHours: 2, daysLeft: 32 });
    expect((await api.get(`/goals/${other._id}`)).body).toMatchObject({ current: 0.5, focusHours: 0.5 });
  });

  it('lists active goals first, then by target date, with filters', async () => {
    const make = (title, status, targetDate) => goal({ title, category: 'family', level: 'yearly', status, targetDate });
    await make('Dropped', 'dropped', '2026-10-01');
    await make('Later', 'active', '2026-12-31');
    await make('Someday', 'active', null);
    await make('Paused', 'paused', '2026-10-01');
    await make('Soon', 'active', '2026-10-15');
    await make('Done', 'achieved', '2026-09-01');
    const titles = async (query) => (await api.get(`/goals?${query}`)).body.items.map((g) => g.title);
    expect(await titles('category=family')).toEqual(['Soon', 'Later', 'Someday', 'Paused', 'Done', 'Dropped']);
    expect(await titles('category=family&status=active')).toEqual(['Soon', 'Later', 'Someday']);
    expect(await titles('category=family&level=monthly')).toEqual([]);
    expect((await api.get('/goals?status=done')).body).toEqual({
      error: { message: 'Invalid filters', fields: { status: 'Choose a valid option' } },
    });
  });

  it.each([
    [{}, { title: 'Required', level: 'Choose a valid option', category: 'Choose a valid option' }],
    [
      { title: ' ', level: 'weekly', category: 'money', tracking: 'likes', targetValue: -1 },
      { title: 'Title is required', level: 'Choose a valid option', tracking: 'Choose a valid option', targetValue: 'Must be at least 0' },
    ],
    [
      { title: 'Goal', level: 'monthly', category: 'money', startDate: '2026-02-30', productIds: ['abc'] },
      { startDate: 'Use a YYYY-MM-DD date', 'productIds.0': 'Invalid id' },
    ],
  ])('rejects %o', async (body, fields) => {
    const res = await api.post('/goals', body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(fieldError(fields));
  });

  it('asks for a linked product when progress follows product results, on create and on the saved goal', async () => {
    const LINK = 'Link at least one product to track this';
    const unlinked = await api.post('/goals', { title: 'Sales', level: 'monthly', category: 'money', tracking: 'purchases' });
    expect(unlinked.status).toBe(400);
    expect(unlinked.body).toEqual(fieldError({ productIds: LINK }));
    const g = await goal({ title: 'Switches tracking' });
    const linkError = { error: { message: LINK, fields: { productIds: LINK } } };
    expect((await api.patch(`/goals/${g._id}`, { tracking: 'revenue' })).body).toEqual(linkError);
    const linked = await api.patch(`/goals/${g._id}`, { tracking: 'revenue', productIds: [kids._id] });
    expect(linked.body).toMatchObject({ tracking: 'revenue' });
    expect((await api.patch(`/goals/${g._id}`, { productIds: [] })).body).toEqual(linkError);
    expect((await api.patch(`/goals/${g._id}`, { tracking: 'contribution' })).status).toBe(200);
    expect((await api.get(`/goals/${g._id}`)).body).toMatchObject({ tracking: 'contribution', productIds: [kids._id] });
    expect((await api.patch(`/goals/${g._id}`, { tracking: 'focus_hours', productIds: [] })).body).toMatchObject({ productIds: [] });
  });

  it('keeps achievedAt through an edit that resends unchanged targets and stamps it when marked achieved', async () => {
    const g = await goal({ tracking: 'revenue', targetValue: 1000, startDate: '2026-09-01', productIds: [kids._id] });
    await Goal.updateOne({ _id: g._id }, { $set: { achievedAt: new Date('2026-09-20T10:00:00.000Z') } });
    const form = {
      title: 'Renamed',
      tracking: 'revenue',
      targetValue: 1000,
      startDate: '2026-09-01',
      targetDate: null,
      status: 'active',
      productIds: [kids._id],
    };
    expect((await api.patch(`/goals/${g._id}`, form)).body).toMatchObject({ title: 'Renamed', achievedAt: '2026-09-20T10:00:00.000Z' });
    expect((await api.patch(`/goals/${g._id}`, { ...form, targetValue: 2000 })).body.achievedAt).toBeNull();
    setNow('2026-09-29T08:00:00.000Z');
    const achieved = await api.patch(`/goals/${g._id}`, { ...form, targetValue: 3000, status: 'achieved' });
    expect(achieved.body).toMatchObject({ status: 'achieved', achievedAt: '2026-09-29T08:00:00.000Z' });
  });

  it('rejects unknown products and a target date before the start date', async () => {
    const base = { title: 'Goal', level: 'monthly', category: 'money' };
    expect((await api.post('/goals', { ...base, productIds: [kids._id, MISSING_ID] })).body).toEqual({
      error: { message: 'Unknown product', fields: { productIds: 'Choose existing products' } },
    });
    expect((await api.post('/goals', { ...base, startDate: '2026-09-10', targetDate: '2026-09-09' })).body).toEqual({
      error: { message: 'Target date is before start date', fields: { targetDate: 'Target date is before start date' } },
    });
  });

  it('checks dates against the stored values and honours explicit nulls on update', async () => {
    const g = await goal({ startDate: '2026-09-10', targetDate: '2026-09-30' });
    const early = await api.patch(`/goals/${g._id}`, { targetDate: '2026-09-01' });
    expect(early.status).toBe(400);
    expect(early.body.error.fields).toEqual({ targetDate: 'Target date is before start date' });
    const cleared = await api.patch(`/goals/${g._id}`, { startDate: null, targetDate: '2026-09-01' });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ startDate: null, targetDate: '2026-09-01' });
    const unknown = await api.patch(`/goals/${g._id}`, { productIds: [MISSING_ID] });
    expect(unknown.body.error.fields).toEqual({ productIds: 'Choose existing products' });
    expect((await api.patch(`/goals/${MISSING_ID}`, { title: 'Nope' })).body).toEqual({ error: { message: 'Goal not found' } });
  });

  it('stamps achievedAt when a goal is marked achieved and clears it when reopened', async () => {
    const g = await goal({});
    setNow('2026-09-29T08:00:00.000Z');
    expect((await api.patch(`/goals/${g._id}`, { status: 'achieved' })).body.achievedAt).toBe('2026-09-29T08:00:00.000Z');
    setNow('2026-09-29T09:00:00.000Z');
    expect((await api.patch(`/goals/${g._id}`, { notes: 'Celebrated' })).body.achievedAt).toBe('2026-09-29T08:00:00.000Z');
    expect((await api.patch(`/goals/${g._id}`, { status: 'active' })).body.achievedAt).toBeNull();
    expect(await goal({ status: 'achieved' })).toMatchObject({ achievedAt: '2026-09-29T09:00:00.000Z' });
  });

  it('unlinks blocks, focus sessions and outcomes when a goal is deleted', async () => {
    const target = await goal({ title: 'Temporary' });
    const block = await create('/time-blocks', { name: 'Linked block', start: '07:00', end: '08:00', goalId: target._id });
    const session = await focus({ goalId: target._id, label: 'Linked focus' }, '2026-09-28T09:00:00+05:30', 20);
    await api.put('/daily-outcomes/2026-09-19', { title: 'Linked outcome', goalId: target._id });
    expect((await api.delete(`/goals/${target._id}`)).status).toBe(204);
    expect((await api.get(`/goals/${target._id}`)).body).toEqual({ error: { message: 'Goal not found' } });
    expect((await api.get('/time-blocks')).body.items.find((b) => b._id === block._id).goalId).toBeNull();
    const sessions = (await api.get('/focus-sessions?from=2026-09-28&to=2026-09-28')).body.items;
    expect(sessions.find((s) => s._id === session._id)).toMatchObject({ goalId: null, goalTitle: '' });
    expect((await api.get('/daily-outcomes/2026-09-19')).body).toMatchObject({ title: 'Linked outcome', goalId: null });
    expect((await api.delete(`/goals/${target._id}`)).status).toBe(404);
  });
});

describe('time blocks', () => {
  const block = (body) => create('/time-blocks', { name: 'Money Block', start: '10:00', end: '12:30', ...body });

  it('creates a block for every day with default reminders', async () => {
    const res = await api.post('/time-blocks', { name: ' Money Block ', start: '10:00', end: '12:30', category: 'business' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Money Block',
      start: '10:00',
      end: '12:30',
      days: [0, 1, 2, 3, 4, 5, 6],
      category: 'business',
      goalId: null,
      productId: null,
      enabled: true,
      reminders: { beforeStart: 5, atStart: true, beforeEnd: null },
    });
    expect((await block({ reminders: { beforeEnd: 10 } })).reminders).toEqual({ beforeStart: 5, atStart: true, beforeEnd: 10 });
  });

  it.each([
    [{ end: '10:00' }, { end: 'End must differ from start' }],
    [{ start: '9:00' }, { start: 'Use a 24-hour HH:MM time' }],
    [{ end: '24:00' }, { end: 'Use a 24-hour HH:MM time' }],
    [{ days: [] }, { days: 'Pick at least one day' }],
    [{ days: [1, 7] }, { 'days.1': 'Must be at most 6' }],
    [{ category: 'sleep' }, { category: 'Choose a valid option' }],
    [{ name: ' ' }, { name: 'Name is required' }],
    [
      { reminders: { beforeStart: 0, beforeEnd: 121 } },
      { 'reminders.beforeStart': 'Must be at least 1', 'reminders.beforeEnd': 'Must be at most 120' },
    ],
  ])('rejects %o', async (body, fields) => {
    const res = await api.post('/time-blocks', { name: 'Block', start: '10:00', end: '11:00', ...body });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(fieldError(fields));
  });

  it('rejects unknown goals and products', async () => {
    expect((await api.post('/time-blocks', { name: 'B', start: '10:00', end: '11:00', goalId: MISSING_ID })).body).toEqual({
      error: { message: 'Goal not found', fields: { goalId: 'Goal not found' } },
    });
    expect((await api.post('/time-blocks', { name: 'B', start: '10:00', end: '11:00', productId: MISSING_ID })).body).toEqual({
      error: { message: 'Product not found', fields: { productId: 'Product not found' } },
    });
  });

  it('accepts overnight blocks and lists blocks by start time', async () => {
    const night = await block({ name: 'Night launch', start: '22:00', end: '01:00' });
    const early = await block({ name: 'Early', start: '05:30', end: '06:00' });
    const { items } = (await api.get('/time-blocks')).body;
    expect(items.map((b) => b.start)).toEqual(items.map((b) => b.start).sort());
    expect([items.at(0)._id, items.at(-1)._id]).toEqual([early._id, night._id]);
  });

  it('merges reminder changes and updates links, days and the enabled switch', async () => {
    const b = await block({ reminders: { beforeEnd: 10 } });
    const linkedGoal = await goal({ title: 'Linked' });
    const product = await createProduct({ name: 'Linked product' });
    const res = await api.patch(`/time-blocks/${b._id}`, {
      reminders: { atStart: false, beforeStart: null },
      days: [1, 3, 5],
      goalId: linkedGoal._id,
      productId: product._id,
      enabled: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      days: [1, 3, 5],
      goalId: linkedGoal._id,
      productId: product._id,
      enabled: false,
      reminders: { beforeStart: null, atStart: false, beforeEnd: 10 },
    });
    const cleared = await api.patch(`/time-blocks/${b._id}`, { goalId: null, reminders: { beforeEnd: null } });
    expect(cleared.body).toMatchObject({
      goalId: null,
      productId: product._id,
      reminders: { beforeStart: null, atStart: false, beforeEnd: null },
    });
    expect((await api.patch(`/time-blocks/${b._id}`, { goalId: MISSING_ID })).status).toBe(400);
  });

  it('keeps start and end different when updating', async () => {
    const b = await block({ start: '14:00', end: '15:00' });
    const res = await api.patch(`/time-blocks/${b._id}`, { end: '14:00' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'End must differ from start', fields: { end: 'End must differ from start' } } });
    expect((await api.get('/time-blocks')).body.items.find((x) => x._id === b._id)).toMatchObject({ start: '14:00', end: '15:00' });
    const swapped = await api.patch(`/time-blocks/${b._id}`, { start: '15:00', end: '14:00' });
    expect(swapped.body).toMatchObject({ start: '15:00', end: '14:00' });
  });

  it('keeps the before-end reminder shorter than the block, on create and on the saved block', async () => {
    const tooLong = fieldError({ 'reminders.beforeEnd': 'Must be shorter than the block' });
    const standUp = { name: 'Stand-up', start: '10:00', reminders: { beforeEnd: 15 } };
    expect((await api.post('/time-blocks', { ...standUp, end: '10:10' })).body).toEqual(tooLong);
    const b = await block({ ...standUp, end: '10:30' });
    expect((await api.patch(`/time-blocks/${b._id}`, { end: '10:10' })).body).toEqual(tooLong);
    expect((await api.patch(`/time-blocks/${b._id}`, { reminders: { beforeEnd: 30 } })).body).toEqual(tooLong);
    const saved = (await api.get('/time-blocks')).body.items.find((x) => x._id === b._id);
    expect(saved).toMatchObject({ end: '10:30', reminders: { beforeEnd: 15 } });
    const shorter = await api.patch(`/time-blocks/${b._id}`, { end: '10:10', reminders: { beforeEnd: 5 } });
    expect(shorter.body).toMatchObject({ end: '10:10', reminders: { beforeEnd: 5 } });
  });

  it('deletes a block', async () => {
    const b = await block({ name: 'Temporary' });
    expect((await api.delete(`/time-blocks/${b._id}`)).status).toBe(204);
    expect((await api.delete(`/time-blocks/${b._id}`)).body).toEqual({ error: { message: 'Time block not found' } });
    expect((await api.patch(`/time-blocks/${b._id}`, { name: 'Back' })).status).toBe(404);
  });
});

describe('daily outcomes', () => {
  it('returns an empty outcome for a day without one', async () => {
    const res = await api.get('/daily-outcomes/2026-09-10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: '2026-09-10', ...EMPTY_OUTCOME });
    expect((await api.get('/daily-outcomes/2026-02-30')).body).toEqual({ error: { message: 'Use a YYYY-MM-DD date' } });
  });

  it('upserts the outcome and keeps the time it was first done', async () => {
    const put = (body) => api.put('/daily-outcomes/2026-09-11', body);
    const first = await put({ title: ' Launch test ', tasks: [{ title: 'Write copy' }, { title: 'Book shoot', done: true }] });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      date: '2026-09-11',
      title: 'Launch test',
      done: false,
      doneAt: null,
      tasks: [
        { title: 'Write copy', done: false },
        { title: 'Book shoot', done: true },
      ],
      completedBlocks: [],
    });
    setNow('2026-09-11T10:00:00.000Z');
    expect((await put({ done: true })).body).toMatchObject({ title: 'Launch test', done: true, doneAt: '2026-09-11T10:00:00.000Z' });
    setNow('2026-09-11T12:00:00.000Z');
    const renamed = await put({ done: true, title: 'Launch test v2' });
    expect(renamed.body).toMatchObject({ title: 'Launch test v2', doneAt: '2026-09-11T10:00:00.000Z' });
    expect((await put({ done: false })).body).toMatchObject({ done: false, doneAt: null });
    expect((await api.get('/daily-outcomes/2026-09-11')).body).toMatchObject({ _id: first.body._id, title: 'Launch test v2', done: false });
  });

  it('stores links and completed blocks, and clears them with null or an empty list', async () => {
    const product = await createProduct({ name: 'Outcome product' });
    const experiment = await createExperiment(product._id, { name: 'Outcome test' });
    const saved = await api.put('/daily-outcomes/2026-09-12', {
      title: 'Ship',
      productId: product._id,
      experimentId: experiment._id,
      completedBlocks: [MISSING_ID],
    });
    expect(saved.body).toMatchObject({ productId: product._id, experimentId: experiment._id, completedBlocks: [MISSING_ID] });
    const cleared = await api.put('/daily-outcomes/2026-09-12', { productId: null, completedBlocks: [] });
    expect(cleared.body).toMatchObject({ title: 'Ship', productId: null, experimentId: experiment._id, completedBlocks: [] });
  });

  it('validates tasks and block ids without saving', async () => {
    const res = await api.put('/daily-outcomes/2026-09-13', { tasks: [{ title: ' ' }], completedBlocks: ['zz'] });
    expect(res.body).toEqual(fieldError({ 'tasks.0.title': 'Task is required', 'completedBlocks.0': 'Invalid id' }));
    const many = await api.put('/daily-outcomes/2026-09-13', { tasks: Array.from({ length: 11 }, (_, i) => ({ title: `Task ${i}` })) });
    expect(many.status).toBe(400);
    expect(Object.keys(many.body.error.fields)).toEqual(['tasks']);
    expect((await api.get('/daily-outcomes/2026-09-13')).body).toEqual({ date: '2026-09-13', ...EMPTY_OUTCOME });
  });

  it('rejects links to a missing goal, product or experiment without saving', async () => {
    for (const [key, label] of [
      ['goalId', 'Goal'],
      ['productId', 'Product'],
      ['experimentId', 'Experiment'],
    ]) {
      const res = await api.put('/daily-outcomes/2026-09-14', { title: 'Linked', [key]: MISSING_ID });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: { message: `${label} not found`, fields: { [key]: `${label} not found` } } });
    }
    expect((await api.get('/daily-outcomes/2026-09-14')).body).toEqual({ date: '2026-09-14', ...EMPTY_OUTCOME });
  });

  it('lists outcomes in a date range, newest first', async () => {
    const { items } = (await api.get('/daily-outcomes?from=2026-09-11&to=2026-09-12')).body;
    expect(items.map((o) => o.date)).toEqual(['2026-09-12', '2026-09-11']);
    expect((await api.get('/daily-outcomes?from=2026-9-1')).status).toBe(400);
  });
});

describe('focus sessions', () => {
  let refs;

  beforeAll(async () => {
    const product = await createProduct({ name: 'Hooks library' });
    const experiment = await createExperiment(product._id, { name: 'LP test' });
    const target = await goal({ title: 'Ship faster', category: 'business' });
    refs = { goalId: target._id, productId: product._id, experimentId: experiment._id };
  });

  it('runs one session at a time and records the elapsed minutes', async () => {
    ist('2026-09-22', '10:00');
    const res = await api.post('/focus-sessions', { plannedMinutes: 50, label: 'Landing page', category: 'product', ...refs });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'running',
      plannedMinutes: 50,
      label: 'Landing page',
      category: 'product',
      startedAt: '2026-09-22T04:30:00.000Z',
      endedAt: null,
      minutes: 0,
      ...refs,
      goalTitle: 'Ship faster',
      productName: 'Hooks library',
      experimentName: 'LP test',
    });
    const again = await api.post('/focus-sessions', { plannedMinutes: 25 });
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: { message: 'A focus session is already running' } });
    ist('2026-09-22', '10:47');
    const done = await api.patch(`/focus-sessions/${res.body._id}`, { status: 'completed', notes: 'Hero section done' });
    expect(done.body).toMatchObject({
      status: 'completed',
      minutes: 47,
      endedAt: '2026-09-22T05:17:00.000Z',
      notes: 'Hero section done',
      goalTitle: 'Ship faster',
    });
    const late = await api.patch(`/focus-sessions/${res.body._id}`, { status: 'cancelled' });
    expect(late.status).toBe(409);
    expect(late.body).toEqual({ error: { message: 'Only a running session can be completed or cancelled' } });
    const relabelled = await api.patch(`/focus-sessions/${res.body._id}`, { goalId: null, label: 'LP hero' });
    expect(relabelled.body).toMatchObject({ goalId: null, goalTitle: '', label: 'LP hero', minutes: 47 });
  });

  it('caps recorded minutes at four hours and records cancelled sessions', async () => {
    ist('2026-09-23', '08:00');
    const long = await create('/focus-sessions', { plannedMinutes: 240, label: 'Marathon' });
    ist('2026-09-23', '14:00');
    expect((await api.patch(`/focus-sessions/${long._id}`, { status: 'completed' })).body).toMatchObject({ minutes: 240 });
    const short = await create('/focus-sessions', { plannedMinutes: 25, label: 'Interrupted' });
    ist('2026-09-23', '14:10');
    const cancelled = await api.patch(`/focus-sessions/${short._id}`, { status: 'cancelled' });
    expect(cancelled.body).toMatchObject({ status: 'cancelled', minutes: 10 });
  });

  it.each([
    [{ plannedMinutes: 4 }, { plannedMinutes: 'At least 5 minutes' }],
    [{ plannedMinutes: 241, goalId: 'x' }, { plannedMinutes: 'At most 4 hours', goalId: 'Invalid id' }],
    [{}, { plannedMinutes: 'Required' }],
    [{ plannedMinutes: 30, category: 'sleep' }, { category: 'Choose a valid option' }],
  ])('rejects %o', async (body, fields) => {
    const res = await api.post('/focus-sessions', body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(fieldError(fields));
  });

  it('rejects unknown links without starting a session', async () => {
    const res = await api.post('/focus-sessions', { plannedMinutes: 30, productId: MISSING_ID });
    expect(res.body).toEqual({ error: { message: 'Product not found', fields: { productId: 'Product not found' } } });
    expect((await api.get('/focus-sessions?status=running')).body.items).toEqual([]);
  });

  it('filters by status, links and calendar day in the configured timezone', async () => {
    await focus({ productId: refs.productId, label: 'After midnight' }, '2026-09-24T00:30:00+05:30', 30);
    const labels = async (query) => (await api.get(`/focus-sessions?${query}`)).body.items.map((s) => s.label);
    expect(await labels('from=2026-09-24&to=2026-09-24')).toEqual(['After midnight']);
    expect(await labels('from=2026-09-23&to=2026-09-23')).toEqual(['Interrupted', 'Marathon']);
    expect(await labels(`productId=${refs.productId}`)).toEqual(['After midnight', 'LP hero']);
    expect(await labels('status=cancelled&from=2026-09-23&to=2026-09-24')).toEqual(['Interrupted']);
    expect(await labels(`goalId=${refs.goalId}`)).toEqual([]);
    expect(await labels('from=2026-09-22&to=2026-09-24&limit=1')).toEqual(['After midnight']);
    expect((await api.get('/focus-sessions?status=paused')).body).toEqual({
      error: { message: 'Invalid filters', fields: { status: 'Choose a valid option' } },
    });
  });

  it('filters by several statuses at once', async () => {
    const labels = async (query) => (await api.get(`/focus-sessions?${query}`)).body.items.map((s) => s.label);
    expect(await labels('status=completed,running&from=2026-09-23&to=2026-09-23')).toEqual(['Marathon']);
    expect((await api.get('/focus-sessions?status=running,paused')).body).toEqual({
      error: { message: 'Invalid filters', fields: { status: 'Choose a valid option' } },
    });
  });

  it('deletes a session', async () => {
    const session = await focus({ label: 'Throwaway' }, '2026-09-25T15:00:00+05:30', 10);
    expect((await api.delete(`/focus-sessions/${session._id}`)).status).toBe(204);
    expect((await api.delete(`/focus-sessions/${session._id}`)).body).toEqual({ error: { message: 'Focus session not found' } });
  });

  it('keeps a single running session when two starts race past the check', async () => {
    await FocusSession.init();
    ist('2026-09-26', '10:00');
    const first = await create('/focus-sessions', { plannedMinutes: 25, label: 'First tap' });
    vi.spyOn(FocusSession, 'findOne').mockReturnValueOnce({ lean: async () => null });
    try {
      const second = await api.post('/focus-sessions', { plannedMinutes: 25, label: 'Second tap' });
      expect(second.status).toBe(409);
      expect(second.body).toEqual({ error: { message: 'A focus session is already running' } });
      expect((await api.get('/focus-sessions?status=running')).body.items.map((s) => s._id)).toEqual([first._id]);
    } finally {
      vi.restoreAllMocks();
      await api.delete(`/focus-sessions/${first._id}`);
    }
  });
});

describe('habits', () => {
  let walk;
  let gym;

  it('creates habits in order with a weekly target', async () => {
    walk = await create('/habits', { name: ' Walk ' });
    gym = await create('/habits', { name: 'Gym', targetPerWeek: 4 });
    expect(walk).toMatchObject({ name: 'Walk', targetPerWeek: 7, archived: false, order: 0 });
    expect(gym).toMatchObject({ name: 'Gym', targetPerWeek: 4, order: 1 });
  });

  it.each([
    [{ name: ' ' }, { name: 'Name is required' }],
    [{ name: 'Read', targetPerWeek: 8 }, { targetPerWeek: 'Must be at most 7' }],
    [{ name: 'Read', targetPerWeek: 0 }, { targetPerWeek: 'Must be at least 1' }],
  ])('rejects %o', async (body, fields) => {
    const res = await api.post('/habits', body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(fieldError(fields));
  });

  it('hides archived habits unless all are requested', async () => {
    const reading = await create('/habits', { name: 'Reading' });
    const archived = await api.patch(`/habits/${reading._id}`, { archived: true, targetPerWeek: 5 });
    expect(archived.body).toMatchObject({ archived: true, targetPerWeek: 5 });
    expect((await api.get('/habits')).body.items.map((h) => h.name)).toEqual(['Walk', 'Gym']);
    expect((await api.get('/habits?all=true')).body.items.map((h) => h.name)).toEqual(['Walk', 'Gym', 'Reading']);
    expect((await api.patch(`/habits/${MISSING_ID}`, { name: 'Nope' })).body).toEqual({ error: { message: 'Habit not found' } });
  });

  it('records completions idempotently and removes them', async () => {
    const path = `/habits/${walk._id}/completions/2026-09-28`;
    expect((await api.put(path)).status).toBe(204);
    expect((await api.put(path)).status).toBe(204);
    await api.put(`/habits/${gym._id}/completions/2026-09-27`);
    const range = async (query) => (await api.get(`/habits/completions?${query}`)).body.items.map((c) => [c.habitId, c.date]);
    expect(await range('from=2026-09-28&to=2026-09-28')).toEqual([[walk._id, '2026-09-28']]);
    expect(await range('from=2026-09-01&to=2026-09-30')).toEqual([
      [gym._id, '2026-09-27'],
      [walk._id, '2026-09-28'],
    ]);
    expect((await api.delete(path)).status).toBe(204);
    expect((await api.delete(path)).status).toBe(204);
    expect(await range('from=2026-09-28&to=2026-09-28')).toEqual([]);
    expect((await api.put(`/habits/${MISSING_ID}/completions/2026-09-28`)).body).toEqual({ error: { message: 'Habit not found' } });
    expect((await api.put(`/habits/${walk._id}/completions/2026-09-31`)).body).toEqual({ error: { message: 'Use a YYYY-MM-DD date' } });
  });

  it('rejects completions after today in the configured timezone', async () => {
    const future = await api.put(`/habits/${walk._id}/completions/2026-09-30`);
    expect(future.status).toBe(400);
    expect(future.body).toEqual({ error: { message: 'Date is in the future', fields: { date: 'Date is in the future' } } });
    setNow('2026-09-29T20:00:00.000Z');
    expect((await api.put(`/habits/${walk._id}/completions/2026-09-30`)).status).toBe(204);
    expect((await api.put(`/habits/${walk._id}/completions/2026-10-01`)).status).toBe(400);
    await api.patch('/settings', { timezone: 'America/New_York' });
    try {
      setNow('2026-09-30T02:00:00.000Z');
      expect((await api.put(`/habits/${gym._id}/completions/2026-09-30`)).status).toBe(400);
      expect((await api.put(`/habits/${gym._id}/completions/2026-09-29`)).status).toBe(204);
    } finally {
      await api.patch('/settings', { timezone: 'Asia/Kolkata' });
    }
  });

  it('rejects personal records dated before 2000', async () => {
    const tooOld = { error: { message: 'Use a date from 2000 onwards' } };
    expect((await api.put(`/habits/${gym._id}/completions/0001-01-01`)).body).toEqual(tooOld);
    expect((await api.put('/daily-outcomes/1999-12-31', { title: 'Typo year' })).body).toEqual(tooOld);
    expect((await api.put('/reviews/daily/0026-09-29', { lesson: 'Typo year' })).body).toEqual(tooOld);
    expect((await api.get('/habits/completions?from=0001-01-01&to=2000-01-01')).body.items).toEqual([]);
  });

  it('deletes a habit with its history', async () => {
    expect((await api.delete(`/habits/${walk._id}`)).status).toBe(204);
    const { items } = (await api.get('/habits/completions?from=2026-09-01&to=2026-09-30')).body;
    expect(items.map((c) => c.habitId)).toEqual([gym._id, gym._id]);
    expect((await api.delete(`/habits/${walk._id}`)).status).toBe(404);
  });
});

describe('reviews', () => {
  it('saves the daily review, closes the outcome and sets tomorrow', async () => {
    await api.put('/daily-outcomes/2026-09-24', { title: 'Finish LP v2' });
    setNow('2026-09-24T16:30:00.000Z');
    const res = await api.put('/reviews/daily/2026-09-24', {
      outcomeCompleted: true,
      accomplishment: ' Shipped LP v2 ',
      lesson: 'Video demos convert',
      blocker: '',
      tomorrowOutcome: 'Launch creative test',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      date: '2026-09-24',
      outcomeCompleted: true,
      accomplishment: 'Shipped LP v2',
      lesson: 'Video demos convert',
      blocker: '',
      tomorrowOutcome: 'Launch creative test',
    });
    expect((await api.get('/daily-outcomes/2026-09-24')).body).toMatchObject({ done: true, doneAt: '2026-09-24T16:30:00.000Z' });
    expect((await api.get('/daily-outcomes/2026-09-25')).body).toMatchObject({ title: 'Launch creative test', done: false });

    setNow('2026-09-24T17:00:00.000Z');
    await api.put('/reviews/daily/2026-09-24', { outcomeCompleted: true, lesson: 'Short hooks win' });
    expect((await api.get('/daily-outcomes/2026-09-24')).body).toMatchObject({ done: true, doneAt: '2026-09-24T16:30:00.000Z' });
    expect((await api.get('/reviews/daily/2026-09-24')).body).toMatchObject({ accomplishment: 'Shipped LP v2', lesson: 'Short hooks win' });
    await api.put('/reviews/daily/2026-09-24', { outcomeCompleted: false });
    expect((await api.get('/daily-outcomes/2026-09-24')).body).toMatchObject({ done: false, doneAt: null });
  });

  it('does not invent an outcome for a day without one', async () => {
    expect((await api.put('/reviews/daily/2026-09-05', { outcomeCompleted: true })).status).toBe(200);
    expect((await api.get('/daily-outcomes/2026-09-05')).body).toEqual({ date: '2026-09-05', ...EMPTY_OUTCOME });
  });

  it("replaces tomorrow's outcome title and keeps its tasks", async () => {
    await api.put('/daily-outcomes/2026-09-07', { title: 'Old plan', tasks: [{ title: 'Keep me' }] });
    await api.put('/reviews/daily/2026-09-06', { tomorrowOutcome: 'New plan' });
    expect((await api.get('/daily-outcomes/2026-09-07')).body).toMatchObject({ title: 'New plan', tasks: [{ title: 'Keep me' }] });
  });

  it('reads and lists daily reviews', async () => {
    const missing = await api.get('/reviews/daily/2026-09-01');
    expect(missing.status).toBe(200);
    expect(missing.body).toBeNull();
    const { items } = (await api.get('/reviews/daily?from=2026-09-01&to=2026-09-30')).body;
    expect(items.map((r) => r.date)).toEqual(['2026-09-24', '2026-09-06', '2026-09-05']);
  });

  it('validates the daily review', async () => {
    const res = await api.put('/reviews/daily/2026-09-24', { accomplishment: 'x'.repeat(501), outcomeCompleted: 'yes' });
    expect(res.body).toEqual(fieldError({ outcomeCompleted: 'Invalid value', accomplishment: 'Use at most 500 characters' }));
  });

  it('saves weekly reviews for Monday week starts only', async () => {
    const tuesday = await api.put('/reviews/weekly/2026-09-29', { wins: 'Too late' });
    expect(tuesday.status).toBe(400);
    expect(tuesday.body).toEqual({ error: { message: 'Weeks start on Monday', fields: { weekStart: 'Weeks start on Monday' } } });
    const body = { wins: 'Scaled Kids videos', lessons: 'UGC wins', nextFocus: 'Launch planner' };
    expect((await api.put('/reviews/weekly/2026-09-28', body)).body).toMatchObject({ weekStart: '2026-09-28', ...body });
    const edited = await api.put('/reviews/weekly/2026-09-28', { nextFocus: 'Kill planner' });
    expect(edited.body).toMatchObject({ wins: 'Scaled Kids videos', nextFocus: 'Kill planner' });
    const week = (query) => api.get(`/reviews/weekly${query}`).then((res) => res.body);
    expect(await week('?start=2026-10-04')).toMatchObject({ weekStart: '2026-09-28', weekEnd: '2026-10-04', review: { wins: body.wins } });
    expect((await week('')).weekStart).toBe('2026-09-28');
    expect(await week('?start=2026-09-27')).toMatchObject({ weekStart: '2026-09-21', weekEnd: '2026-09-27', review: null });
    expect(await week('?start=soon')).toEqual({ error: { message: 'Invalid filters', fields: { start: 'Use a YYYY-MM-DD date' } } });
  });
});
