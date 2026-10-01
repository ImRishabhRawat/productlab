import { beforeAll, describe, expect, it } from 'vitest';
import { MISSING_ID, api, create, createCreative, createExperiment, createProduct, setupApi } from './setup.js';

setupApi();

const names = (res) => res.body.items.map((i) => i.name).sort();
let planner;
let course;

beforeAll(async () => {
  const costs = { paymentFeePct: 2, refundRatePct: 5, variableCostPerSale: 10 };
  planner = await createProduct({ name: 'Planner', category: 'Templates', costs });
  course = await createProduct({ name: 'Course', price: 1999 });
});

describe('experiments', () => {
  it('creates an experiment for an existing product', async () => {
    const res = await api.post('/experiments', {
      productId: planner._id,
      name: 'Price test',
      variables: { price: 399, offer: 'Bonus pack' },
      startDate: '2026-09-01',
      campaign: 'launch',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      productId: planner._id,
      name: 'Price test',
      status: 'planned',
      variables: { price: 399, offer: 'Bonus pack', audience: '', creative: '', angle: '', landingPage: '', cta: '' },
      startDate: '2026-09-01',
      endDate: null,
      budget: null,
      campaign: 'launch',
    });
  });

  it('rejects unknown products and malformed ids', async () => {
    const missing = await api.post('/experiments', { productId: MISSING_ID, name: 'Orphan' });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: { message: 'Product not found', fields: { productId: 'Product not found' } } });
    const malformed = await api.post('/experiments', { productId: 'abc', name: 'Orphan' });
    expect(malformed.body.error.fields).toEqual({ productId: 'Invalid id' });
  });

  it('rejects an end date before the start date', async () => {
    const dates = (startDate, endDate) => ({ productId: planner._id, name: 'One day', startDate, endDate });
    const res = await api.post('/experiments', dates('2026-09-10', '2026-09-01'));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'End date is before start date', fields: { endDate: 'End date is before start date' } } });
    expect((await api.post('/experiments', dates('2026-09-10', '2026-09-10'))).status).toBe(201);
  });

  it('checks the date order against saved dates on update', async () => {
    const x = await createExperiment(planner._id, { startDate: '2026-09-01', endDate: '2026-09-10' });
    expect((await api.patch(`/experiments/${x._id}`, { endDate: '2026-08-31' })).status).toBe(400);
    expect((await api.patch(`/experiments/${x._id}`, { startDate: '2026-09-11' })).status).toBe(400);
    const res = await api.patch(`/experiments/${x._id}`, { startDate: '2026-09-05', status: 'running' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ startDate: '2026-09-05', endDate: '2026-09-10', status: 'running' });
  });

  it('clears the end date while moving the start date', async () => {
    const x = await createExperiment(planner._id, { startDate: '2026-09-01', endDate: '2026-09-10' });
    const res = await api.patch(`/experiments/${x._id}`, { startDate: '2026-09-15', endDate: null });
    expect(res.body).toMatchObject({ startDate: '2026-09-15', endDate: null });
    expect(res.status).toBe(200);
  });

  it('merges variables and keeps the product fixed', async () => {
    const x = await createExperiment(planner._id, { variables: { price: 399, offer: 'Bonus pack' } });
    const body = { variables: { audience: 'Parents' }, productId: course._id, name: 'Audience test' };
    const res = await api.patch(`/experiments/${x._id}`, body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Audience test',
      productId: planner._id,
      variables: { price: 399, offer: 'Bonus pack', audience: 'Parents' },
    });
  });

  it('returns the experiment with its product', async () => {
    const x = await createExperiment(planner._id);
    const res = await api.get(`/experiments/${x._id}`);
    expect(res.body.product).toEqual({
      _id: planner._id,
      name: 'Planner',
      status: 'ready_to_test',
      price: 499,
      category: 'Templates',
      costs: { paymentFeePct: 2, refundRatePct: 5, variableCostPerSale: 10 },
      desiredMarginPct: 20,
      version: 'v1',
    });
    expect((await api.get(`/experiments/${MISSING_ID}`)).body).toEqual({ error: { message: 'Experiment not found' } });
  });

  it('lists with product names, filters and campaign facets', async () => {
    const variables = { angle: 'Career switch' };
    await createExperiment(course._id, { name: 'Course hooks', status: 'running', campaign: 'course-q3', variables });
    const byProduct = await api.get(`/experiments?productId=${course._id}`);
    expect(byProduct.body.items.map((x) => [x.name, x.productName])).toEqual([['Course hooks', 'Course']]);
    expect(byProduct.body.facets).toEqual({ campaigns: ['course-q3'] });
    expect(names(await api.get('/experiments?campaign=launch'))).toEqual(['Price test']);
    expect(names(await api.get('/experiments?q=career'))).toEqual(['Course hooks']);
    expect(names(await api.get('/experiments?status=running'))).toEqual(['Course hooks', 'Test experiment']);
    expect((await api.get('/experiments')).body.facets).toEqual({ campaigns: ['course-q3', 'launch'] });
  });

  it('deletes experiments without results together with their creatives', async () => {
    const x = await createExperiment(planner._id);
    const c = await createCreative(x._id);
    expect((await api.delete(`/experiments/${x._id}`)).status).toBe(204);
    expect((await api.get(`/experiments/${x._id}`)).status).toBe(404);
    expect((await api.get(`/creatives?experimentId=${x._id}`)).body.items).toEqual([]);
    expect((await api.patch(`/creatives/${c._id}`, { name: 'Gone' })).status).toBe(404);
    expect((await api.delete(`/experiments/${x._id}`)).status).toBe(404);
  });

  it('refuses to delete experiments with metrics or decisions', async () => {
    const measured = await createExperiment(planner._id);
    await create('/metrics', { experimentId: measured._id, date: '2026-09-01', spend: 100 });
    const decided = await createExperiment(planner._id);
    const decision = { decision: 'continue', reason: 'Early', date: '2026-09-02' };
    await create('/decisions', { productId: planner._id, experimentId: decided._id, ...decision });
    for (const x of [measured, decided]) {
      const res = await api.delete(`/experiments/${x._id}`);
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: { message: 'This experiment has recorded results. Stop it instead of deleting it.' } });
      expect((await api.get(`/experiments/${x._id}`)).status).toBe(200);
    }
  });
});

describe('creatives', () => {
  let x;

  beforeAll(async () => {
    x = await createExperiment(course._id, { name: 'Creative test', campaign: 'course-launch' });
  });

  it('inherits the product and campaign from the experiment', async () => {
    const res = await api.post('/creatives', { experimentId: x._id, name: 'Hook A', hook: 'Stop wasting weekends', format: 'reel' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      experimentId: x._id,
      productId: course._id,
      campaign: 'course-launch',
      format: 'reel',
      startDate: null,
    });
    expect(await createCreative(x._id, { campaign: 'retargeting' })).toMatchObject({ productId: course._id, campaign: 'retargeting' });
  });

  it('rejects unknown experiments and invalid formats', async () => {
    const res = await api.post('/creatives', { experimentId: MISSING_ID, name: 'Orphan' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Experiment not found', fields: { experimentId: 'Experiment not found' } } });
    expect((await api.post('/creatives', { experimentId: x._id, name: 'Odd', format: 'hologram' })).body.error.fields).toEqual({
      format: 'Choose a valid option',
    });
  });

  it('updates, lists and searches creatives', async () => {
    const c = await createCreative(x._id, { name: 'Hook C' });
    const res = await api.patch(`/creatives/${c._id}`, { angle: 'Fear of missing out', experimentId: MISSING_ID });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ angle: 'Fear of missing out', experimentId: x._id });
    expect(names(await api.get(`/creatives?experimentId=${x._id}`))).toEqual(['Hook A', 'Hook C', 'Test creative']);
    expect(names(await api.get(`/creatives?productId=${course._id}&q=missing`))).toEqual(['Hook C']);
  });

  it('refuses to delete creatives with metrics', async () => {
    const used = await createCreative(x._id, { name: 'Used' });
    await create('/metrics', { creativeId: used._id, date: '2026-09-01', spend: 50 });
    const res = await api.delete(`/creatives/${used._id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { message: 'This creative has recorded metrics and is kept for history.' } });
    const unused = await createCreative(x._id, { name: 'Unused' });
    expect((await api.delete(`/creatives/${unused._id}`)).status).toBe(204);
    expect((await api.delete(`/creatives/${unused._id}`)).status).toBe(404);
  });
});

describe('metrics', () => {
  let x;
  let hook;

  beforeAll(async () => {
    x = await createExperiment(planner._id, { name: 'Metric test', campaign: 'planner-launch' });
    hook = await createCreative(x._id, { name: 'Metric hook', campaign: 'planner-hooks' });
  });

  it('resolves the experiment, product and campaign from the creative', async () => {
    const res = await api.post('/metrics', { creativeId: hook._id, date: '2026-09-01', spend: 1000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      productId: planner._id,
      experimentId: x._id,
      creativeId: hook._id,
      campaign: 'planner-hooks',
      spend: 1000,
      impressions: 0,
    });
  });

  it('resolves the product and campaign from the experiment', async () => {
    const res = await api.post('/metrics', { experimentId: x._id, date: '2026-09-02', spend: 10, campaign: 'custom' });
    expect(res.body).toMatchObject({ productId: planner._id, experimentId: x._id, creativeId: null, campaign: 'custom' });
    expect((await create('/metrics', { experimentId: x._id, date: '2026-09-02' })).campaign).toBe('planner-launch');
  });

  it('accepts product-level entries', async () => {
    expect(await create('/metrics', { productId: course._id, date: '2026-09-03', spend: 5 })).toMatchObject({
      productId: course._id,
      experimentId: null,
      creativeId: null,
      campaign: '',
    });
  });

  it('rejects an experiment or creative that belongs to another product', async () => {
    for (const body of [{ experimentId: x._id }, { creativeId: hook._id }]) {
      const res = await api.post('/metrics', { ...body, productId: course._id, date: '2026-09-01' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: { message: 'Experiment belongs to another product', fields: { experimentId: 'Experiment belongs to another product' } },
      });
    }
  });

  it('requires a product and existing references', async () => {
    const cases = [
      [{}, { productId: 'Choose a product' }],
      [{ productId: MISSING_ID }, { productId: 'Product not found' }],
      [{ experimentId: MISSING_ID }, { experimentId: 'Experiment not found' }],
      [{ creativeId: MISSING_ID }, { creativeId: 'Creative not found' }],
    ];
    for (const [body, fields] of cases) {
      const res = await api.post('/metrics', { ...body, date: '2026-09-01' });
      expect(res.status).toBe(400);
      expect(res.body.error.fields).toEqual(fields);
    }
  });

  it('validates metric values', async () => {
    const res = await api.post('/metrics', { productId: planner._id, date: '2026-9-1', impressions: 1.5, spend: -1 });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({
      date: 'Use a YYYY-MM-DD date',
      impressions: 'Enter a whole number',
      spend: 'Must be at least 0',
    });
  });

  it('lists entries with names and derived metrics using product costs', async () => {
    const entry = await create('/metrics', {
      creativeId: hook._id,
      date: '2026-09-05',
      spend: 1000,
      impressions: 40000,
      reach: 30000,
      clicks: 800,
      landingPageViews: 600,
      checkouts: 60,
      purchases: 20,
      revenue: 10000,
    });
    const res = await api.get(`/metrics?creativeId=${hook._id}&from=2026-09-05&to=2026-09-05`);
    expect(res.body.total).toBe(1);
    const [item] = res.body.items;
    expect(item).toMatchObject({ _id: entry._id, productName: 'Planner', experimentName: 'Metric test', creativeName: 'Metric hook' });
    expect(item.derived).toEqual({
      spend: 1000,
      impressions: 40000,
      reach: 30000,
      clicks: 800,
      landingPageViews: 600,
      checkouts: 60,
      purchases: 20,
      revenue: 10000,
      fees: 200,
      refunds: 500,
      otherCosts: 200,
      variableCosts: 900,
      contribution: 8100,
      contributionMargin: 81,
      ctr: 2,
      cpc: 1.25,
      cpm: 25,
      checkoutRate: 10,
      conversionRate: 3.33,
      cac: 50,
      roas: 10,
      aov: 500,
    });
  });

  it('pages newest first and filters by product, experiment and campaign', async () => {
    const all = await api.get(`/metrics?experimentId=${x._id}`);
    expect(all.body.total).toBe(4);
    expect(all.body.items.map((i) => i.date)).toEqual(['2026-09-05', '2026-09-02', '2026-09-02', '2026-09-01']);
    const page = await api.get(`/metrics?experimentId=${x._id}&limit=2&offset=1`);
    expect(page.body).toMatchObject({ total: 4 });
    expect(page.body.items.map((i) => i.date)).toEqual(['2026-09-02', '2026-09-02']);
    expect((await api.get('/metrics?campaign=custom')).body.total).toBe(1);
    expect((await api.get(`/metrics?productId=${course._id}`)).body.items.map((i) => i.experimentName)).toEqual(['', 'Creative test']);
  });

  it('pages entries that share a date without repeating or skipping any', async () => {
    const paged = await createExperiment(planner._id, { name: 'Paging test' });
    for (let i = 0; i < 40; i += 1) await create('/metrics', { experimentId: paged._id, date: '2026-09-07', spend: i });
    const ids = async (query) => (await api.get(`/metrics?experimentId=${paged._id}&${query}`)).body.items.map((i) => i._id);
    const all = await ids('limit=500');
    const pages = [];
    for (let offset = 0; offset < 40; offset += 6) pages.push(...(await ids(`limit=6&offset=${offset}`)));
    expect(new Set(pages).size).toBe(40);
    expect(pages).toEqual(all);
  });

  it('updates values but not references, and deletes entries', async () => {
    const entry = await create('/metrics', { experimentId: x._id, date: '2026-09-20', spend: 100 });
    const res = await api.patch(`/metrics/${entry._id}`, { spend: 150, clicks: 40, productId: course._id, experimentId: null });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ spend: 150, clicks: 40, productId: planner._id, experimentId: x._id });
    expect((await api.delete(`/metrics/${entry._id}`)).status).toBe(204);
    const again = await api.delete(`/metrics/${entry._id}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { message: 'Metric entry not found' } });
  });
});

describe('campaign renames', () => {
  const byKey = (items, key) => Object.fromEntries(items.map((i) => [i[key], i.campaign]));

  it('moves creatives, metrics and orders that used the old experiment campaign', async () => {
    const x = await createExperiment(planner._id, { name: 'Diwali', campaign: 'diwali-sael' });
    const inherited = await createCreative(x._id, { name: 'Inherited' });
    const own = await createCreative(x._id, { name: 'Own', campaign: 'retargeting' });
    await create('/metrics', { creativeId: inherited._id, date: '2026-09-10', spend: 1000 });
    await create('/metrics', { creativeId: own._id, date: '2026-09-10', spend: 200 });
    await create('/metrics', { experimentId: x._id, date: '2026-09-11', spend: 300 });
    await create('/metrics', { experimentId: x._id, date: '2026-09-11', spend: 40, campaign: 'typed' });
    const order = await create('/orders', {
      productId: planner._id,
      experimentId: x._id,
      campaign: 'diwali-sael',
      customer: { email: 'diwali@example.com' },
      items: [{ kind: 'main', amount: 499 }],
      date: '2026-09-11',
    });

    expect((await api.patch(`/experiments/${x._id}`, { campaign: 'diwali-sale' })).status).toBe(200);
    const creatives = (await api.get(`/creatives?experimentId=${x._id}`)).body.items;
    expect(byKey(creatives, 'name')).toEqual({ Inherited: 'diwali-sale', Own: 'retargeting' });
    expect(byKey((await api.get(`/metrics?experimentId=${x._id}`)).body.items, 'spend')).toEqual({
      1000: 'diwali-sale',
      200: 'retargeting',
      300: 'diwali-sale',
      40: 'typed',
    });
    const spend = async (campaign) => (await api.get(`/analytics/summary?campaign=${campaign}`)).body.current.spend;
    expect([await spend('diwali-sale'), await spend('diwali-sael')]).toEqual([1300, 0]);
    expect((await api.get(`/orders/${order._id}`)).body.campaign).toBe('diwali-sale');
    expect((await create('/metrics', { creativeId: inherited._id, date: '2026-09-12' })).campaign).toBe('diwali-sale');
  });

  it('moves metric rows with their creative when its campaign changes', async () => {
    const x = await createExperiment(planner._id, { name: 'Hooks', campaign: 'hooks' });
    const hook = await createCreative(x._id, { name: 'Hook', campaign: 'hooks-v1' });
    await create('/metrics', { creativeId: hook._id, date: '2026-09-10', spend: 10 });
    await create('/metrics', { creativeId: hook._id, date: '2026-09-11', spend: 20, campaign: 'typed' });
    const rows = async () => byKey((await api.get(`/metrics?creativeId=${hook._id}`)).body.items, 'spend');

    await api.patch(`/creatives/${hook._id}`, { campaign: 'hooks-v2' });
    expect(await rows()).toEqual({ 10: 'hooks-v2', 20: 'typed' });
    await api.patch(`/creatives/${hook._id}`, { campaign: '' });
    expect(await rows()).toEqual({ 10: 'hooks', 20: 'typed' });
    expect((await create('/metrics', { creativeId: hook._id, date: '2026-09-12' })).campaign).toBe('hooks');
  });
});
