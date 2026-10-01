import { addDays } from '@product-lab/shared/dates';
import { beforeAll, describe, expect, it } from 'vitest';
import { MISSING_ID, api, create, createCreative, createExperiment, createProduct, resetDb, setNow, setupApi } from './setup.js';

setupApi();

const NOW = '2026-09-28T19:00:00.000Z';
const TODAY = '2026-09-29';
beforeAll(() => setNow(NOW));

const names = (res) => res.body.items.map((i) => i.name);
const timeline = async (id) => (await api.get(`/products/${id}/timeline`)).body.items;
const events = (items) => items.map(({ type, date, title, from, to, note }) => ({ type, date, title, from, to, note }));

describe('create', () => {
  it('fills status, version and costs from the settings defaults', async () => {
    const res = await api.post('/products', { name: 'Planner', price: 499, costs: { refundRatePct: 5 } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Planner',
      price: 499,
      status: 'ready_to_test',
      version: 'v1',
      ideaId: null,
      costs: { paymentFeePct: 2.5, refundRatePct: 5, variableCostPerSale: 0 },
      desiredMarginPct: 20,
      budget: { daily: null, monthly: null },
      killedAt: null,
      killReason: '',
      learnings: '',
    });
    expect(res.body.events).toBeUndefined();
    expect((await api.get(`/products/${res.body._id}`)).body).toMatchObject({ name: 'Planner', idea: null });
  });

  it('rejects invalid products with field messages', async () => {
    const res = await api.post('/products', { price: -5, status: 'launched' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        message: 'Please fix the highlighted fields',
        fields: { name: 'Required', price: 'Must be at least 0', status: 'Choose a valid option' },
      },
    });
  });

  it('returns 404 for unknown products', async () => {
    expect((await api.get(`/products/${MISSING_ID}`)).body).toEqual({ error: { message: 'Product not found' } });
    expect((await api.patch(`/products/${MISSING_ID}`, { price: 1 })).status).toBe(404);
    expect((await api.get(`/products/${MISSING_ID}/timeline`)).status).toBe(404);
  });

  it('has no delete route and keeps the product', async () => {
    const product = await createProduct();
    const res = await api.delete(`/products/${product._id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Not found' } });
    expect((await api.get(`/products/${product._id}`)).status).toBe(200);
  });
});

describe('update', () => {
  it('logs status, price and version changes to the timeline', async () => {
    const product = await createProduct({ price: 499 });
    const res = await api.patch(`/products/${product._id}`, { status: 'testing', statusNote: 'Ads live', price: 599, version: 'v2' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'testing', price: 599, version: 'v2' });
    expect(res.body.events).toBeUndefined();

    const expected = [
      { type: 'created', date: TODAY, title: 'Product created', from: null, to: 'ready_to_test', note: '' },
      { type: 'version', date: TODAY, title: 'Version set to v2', from: 'v1', to: 'v2', note: '' },
      { type: 'price', date: TODAY, title: 'Price changed', from: 499, to: 599, note: '' },
      { type: 'status', date: TODAY, title: 'Ready to Test → Testing', from: 'ready_to_test', to: 'testing', note: 'Ads live' },
    ];
    expect(events(await timeline(product._id))).toEqual(expected);

    await api.patch(`/products/${product._id}`, { status: 'testing', price: 599, version: 'v2', name: 'Renamed' });
    expect(events(await timeline(product._id))).toEqual(expected);
  });

  it('sets killedAt when killed and clears it when revived', async () => {
    const product = await createProduct({ status: 'testing' });
    const killed = (await api.patch(`/products/${product._id}`, { status: 'killed', killReason: 'No demand' })).body;
    expect(killed).toMatchObject({ status: 'killed', killReason: 'No demand', killedAt: NOW, statusChangedAt: NOW });

    const revived = (await api.patch(`/products/${product._id}`, { status: 'testing' })).body;
    expect(revived).toMatchObject({ status: 'testing', killedAt: null, killReason: 'No demand' });

    expect(await createProduct({ status: 'killed' })).toMatchObject({ killedAt: NOW });
  });

  it('merges costs and budget', async () => {
    const product = await createProduct({ costs: { paymentFeePct: 2, refundRatePct: 3, variableCostPerSale: 5 } });
    await api.patch(`/products/${product._id}`, { costs: { variableCostPerSale: 25 }, budget: { daily: 1500 } });
    const res = await api.patch(`/products/${product._id}`, { budget: { monthly: 40000 } });
    expect(res.body).toMatchObject({
      costs: { paymentFeePct: 2, refundRatePct: 3, variableCostPerSale: 25 },
      budget: { daily: 1500, monthly: 40000 },
    });
  });

  it('validates updates', async () => {
    const product = await createProduct();
    const res = await api.patch(`/products/${product._id}`, { status: 'launched', costs: { paymentFeePct: 120 } });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ status: 'Choose a valid option', 'costs.paymentFeePct': 'Must be at most 100' });
  });

  it('stops open experiments when the product is killed or paused', async () => {
    const statuses = async (id) =>
      Object.fromEntries((await api.get(`/experiments?productId=${id}`)).body.items.map((x) => [x.name, [x.status, x.endDate]]));
    const [killed, paused] = await Promise.all([createProduct({ status: 'testing' }), createProduct({ status: 'testing' })]);
    for (const product of [killed, paused]) {
      await createExperiment(product._id, { name: 'Live', status: 'running', startDate: '2026-09-20' });
      await createExperiment(product._id, { name: 'Ending', status: 'running', startDate: '2026-09-01', endDate: '2026-09-15' });
      await createExperiment(product._id, { name: 'Draft' });
      await createExperiment(product._id, { name: 'Later', startDate: addDays(TODAY, 6) });
      await createExperiment(product._id, { name: 'Done', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-10' });
    }
    await api.patch(`/products/${killed._id}`, { status: 'killed' });
    await api.patch(`/products/${paused._id}`, { status: 'paused' });
    expect(await statuses(killed._id)).toEqual({
      Live: ['stopped', TODAY],
      Ending: ['stopped', '2026-09-15'],
      Draft: ['stopped', TODAY],
      Later: ['stopped', null],
      Done: ['completed', '2026-09-10'],
    });
    expect(await statuses(paused._id)).toEqual({
      Live: ['stopped', TODAY],
      Ending: ['stopped', '2026-09-15'],
      Draft: ['planned', null],
      Later: ['planned', null],
      Done: ['completed', '2026-09-10'],
    });
  });
});

describe('list', () => {
  beforeAll(async () => {
    await resetDb();
    await createProduct({ name: 'Budget planner', category: 'Templates', price: 499, status: 'testing', targetCustomer: 'Young families' });
    await createProduct({ name: 'Excel course', category: 'Courses', price: 1999, status: 'scaling' });
    await createProduct({ name: 'Meal plan', category: 'Templates', price: 299, description: 'Weekly plans for families' });
    await createProduct({ name: 'Uncategorized', price: 99, status: 'killed' });
  });

  it('filters by status, category and search text', async () => {
    expect(names(await api.get('/products?status=testing'))).toEqual(['Budget planner']);
    expect(names(await api.get('/products?category=Templates')).sort()).toEqual(['Budget planner', 'Meal plan']);
    expect(names(await api.get('/products?q=FAMILIES')).sort()).toEqual(['Budget planner', 'Meal plan']);
  });

  it('sorts and returns category facets', async () => {
    expect(names(await api.get('/products?sort=price'))).toEqual(['Uncategorized', 'Meal plan', 'Budget planner', 'Excel course']);
    expect(names(await api.get('/products?sort=-price'))).toEqual(['Excel course', 'Budget planner', 'Meal plan', 'Uncategorized']);
    const res = await api.get('/products');
    expect(res.body.facets).toEqual({ categories: ['Courses', 'Templates'] });
    expect(res.body.items.every((p) => p.events === undefined)).toBe(true);
  });
});

describe('timeline', () => {
  let product;
  let milestone;
  const day = (n) => addDays(TODAY, n);

  beforeAll(async () => {
    const idea = await create('/ideas', { name: 'Habit tracker', expectedPrice: 499 });
    await api.patch(`/ideas/${idea._id}`, { status: 'researching' });
    product = (await api.post(`/ideas/${idea._id}/convert`, {})).body.product;
    const priceTest = await createExperiment(product._id, { name: 'Price test', startDate: day(1), endDate: day(5), status: 'completed' });
    await createExperiment(product._id, { name: 'Angle test', startDate: day(3), endDate: day(9), status: 'running' });
    await createExperiment(product._id, { name: 'Draft test' });
    await createCreative(priceTest._id, { name: 'Hook A', startDate: day(2) });
    await createCreative(priceTest._id, { name: 'Hook B' });
    await create('/metrics', { experimentId: priceTest._id, date: day(2), spend: 100, clicks: 10 });
    await create('/metrics', { experimentId: priceTest._id, date: day(4), spend: 100, purchases: 2, revenue: 998 });
    const order = { productId: product._id, items: [{ kind: 'main', amount: 499 }] };
    await create('/orders', { ...order, customer: { email: 'early@test.local' }, date: day(1), paymentStatus: 'pending' });
    await create('/orders', { ...order, customer: { email: 'first@test.local' }, date: day(3) });
    milestone = await create(`/products/${product._id}/events`, { date: day(2), title: 'Landing page live', note: 'New copy' });
    setNow('2026-10-05T06:30:00.000Z');
    await create('/decisions', { productId: product._id, decision: 'iterate', reason: 'CAC above target', date: day(6) });
    setNow(NOW);
    await create(`/products/${product._id}/versions`, { label: 'v2', date: day(7), price: 799, changes: 'New templates' });
  });

  it('merges idea, product, experiment, creative, purchase and decision events in date order', async () => {
    const items = await timeline(product._id);
    expect(items.map(({ type, date, title }) => [type, date, title])).toEqual([
      ['idea', TODAY, 'Idea created'],
      ['validation', TODAY, 'Validation started'],
      ['created', TODAY, 'Converted from idea'],
      ['experiment', day(1), 'Test launched: Price test'],
      ['milestone', day(2), 'Landing page live'],
      ['creative', day(2), 'Creative launched: Hook A'],
      ['experiment', day(3), 'Test launched: Angle test'],
      ['purchase', day(3), 'First purchase'],
      ['experiment_end', day(5), 'Test completed: Price test'],
      ['decision', day(6), 'Decision: Iterate'],
      ['status', day(6), 'Ready to Test → Iterating'],
      ['version', day(7), 'Version v2 released'],
      ['price', day(7), 'Price changed'],
    ]);
    expect(items.find((i) => i.type === 'status')).toMatchObject({ from: 'ready_to_test', to: 'iterating', note: 'CAC above target' });
    expect(items.find((i) => i.type === 'decision')).toMatchObject({ decision: 'iterate', note: 'CAC above target' });
    expect(items.find((i) => i.type === 'price')).toMatchObject({ from: 499, to: 799 });
    expect(items.find((i) => i.type === 'version')).toMatchObject({ note: 'New templates', to: 799 });
    expect(items.find((i) => i.type === 'milestone')).toMatchObject({ _id: milestone._id, note: 'New copy' });
  });

  it('removes manual milestones only', async () => {
    const other = await createProduct();
    expect((await api.delete(`/products/${other._id}/events/${milestone._id}`)).status).toBe(404);
    expect((await api.delete(`/products/${product._id}/events/${milestone._id}`)).status).toBe(204);
    const items = await timeline(product._id);
    expect(items.some((i) => i.type === 'milestone')).toBe(false);

    const created = items.find((i) => i.type === 'created');
    const res = await api.delete(`/products/${product._id}/events/${created._id}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Milestone not found' } });
    expect((await api.delete(`/products/${product._id}/events/${milestone._id}`)).status).toBe(404);
    expect((await timeline(product._id)).some((i) => i.type === 'created')).toBe(true);
  });

  it('validates milestones', async () => {
    const res = await api.post(`/products/${product._id}/events`, { date: '2026-02-30', title: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ date: 'Use a YYYY-MM-DD date', title: 'Title is required' });
    expect((await api.post(`/products/${MISSING_ID}/events`, { date: TODAY, title: 'x' })).status).toBe(404);
  });

  it('shows a planned experiment as launched only once it runs', async () => {
    const other = await createProduct();
    const x = await createExperiment(other._id, { name: 'Planned test', startDate: TODAY });
    const launches = async () => (await timeline(other._id)).filter((i) => i.type === 'experiment').map((i) => [i.date, i.title]);
    expect(await launches()).toEqual([]);
    await api.patch(`/experiments/${x._id}`, { status: 'running' });
    expect(await launches()).toEqual([[TODAY, 'Test launched: Planned test']]);
  });
});

describe('versions', () => {
  it('sets the product version and logs price changes on the version date', async () => {
    const product = await createProduct({ price: 499 });
    const v2 = await create(`/products/${product._id}/versions`, { label: 'v2', date: '2026-09-10', price: 599, changes: 'New templates' });
    expect(v2).toMatchObject({ productId: product._id, label: 'v2', date: '2026-09-10', price: 599, changes: 'New templates' });
    expect((await api.get(`/products/${product._id}`)).body).toMatchObject({ version: 'v2', price: 599 });

    await create(`/products/${product._id}/versions`, { label: 'v3', date: '2026-09-12' });
    await create(`/products/${product._id}/versions`, { label: 'v3.1', date: '2026-09-11', price: 599 });
    expect((await api.get(`/products/${product._id}`)).body).toMatchObject({ version: 'v3.1', price: 599 });

    const versions = (await api.get(`/products/${product._id}/versions`)).body.items;
    expect(versions.map((v) => v.label)).toEqual(['v3', 'v3.1', 'v2']);

    const prices = (await timeline(product._id)).filter((i) => i.type === 'price');
    expect(prices.map(({ date, from, to }) => ({ date, from, to }))).toEqual([{ date: '2026-09-10', from: 499, to: 599 }]);
  });

  it('deletes versions and validates input', async () => {
    const product = await createProduct();
    const version = await create(`/products/${product._id}/versions`, { label: 'v2', date: '2026-09-10' });
    const other = await createProduct();
    expect((await api.delete(`/products/${other._id}/versions/${version._id}`)).status).toBe(404);
    expect((await api.delete(`/products/${product._id}/versions/${version._id}`)).status).toBe(204);
    const again = await api.delete(`/products/${product._id}/versions/${version._id}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { message: 'Version not found' } });

    const res = await api.post(`/products/${product._id}/versions`, { label: 'v-twenty-one-characters', date: '10-09-2026' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ label: 'Use at most 20 characters', date: 'Use a YYYY-MM-DD date' });
    expect((await api.post(`/products/${MISSING_ID}/versions`, { label: 'v2', date: '2026-09-10' })).status).toBe(404);
  });
});
