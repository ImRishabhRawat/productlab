import { beforeAll, describe, expect, it } from 'vitest';
import { api, create, createCreative, createExperiment, createProduct, resetDb, setNow, setupApi } from './setup.js';

setupApi();

const get = async (path) => {
  const res = await api.get(path);
  expect(res.status).toBe(200);
  return res.body;
};
const names = (items) => items.map((i) => i.name).sort();
const EMPTY_RATIOS = {
  contributionMargin: null,
  ctr: null,
  cpc: null,
  cpm: null,
  checkoutRate: null,
  conversionRate: null,
  cac: null,
  roas: null,
  aov: null,
};
const ZERO = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  landingPageViews: 0,
  checkouts: 0,
  purchases: 0,
  revenue: 0,
  fees: 0,
  refunds: 0,
  otherCosts: 0,
  variableCosts: 0,
  contribution: 0,
  ...EMPTY_RATIOS,
};

describe('ad metric analytics', () => {
  let alpha;
  let beta;
  let gamma;
  let launch;
  let retarget;
  let betaLaunch;
  let hookA;
  let hookC;
  let hookB;

  beforeAll(async () => {
    await resetDb();
    const costs = (paymentFeePct, refundRatePct, variableCostPerSale) => ({ paymentFeePct, refundRatePct, variableCostPerSale });
    alpha = await createProduct({ name: 'Alpha', status: 'testing', costs: costs(2, 5, 10) });
    beta = await createProduct({ name: 'Beta', price: 1000, status: 'testing', costs: costs(3, 0, 0) });
    gamma = await createProduct({ name: 'Gamma' });
    await createProduct({ name: 'Draft', status: 'researching' });
    launch = await createExperiment(alpha._id, { name: 'Alpha launch', status: 'running', campaign: 'alpha-launch' });
    retarget = await createExperiment(alpha._id, { name: 'Alpha retarget', status: 'completed', campaign: 'alpha-retarget' });
    betaLaunch = await createExperiment(beta._id, { name: 'Beta launch', campaign: 'beta-launch' });
    hookA = await createCreative(launch._id, { name: 'Hook A' });
    hookB = await createCreative(launch._id, { name: 'Hook B' });
    hookC = await createCreative(betaLaunch._id, { name: 'Hook C' });
    const funnel = (spend, impressions, reach, clicks, landingPageViews, checkouts, purchases, revenue) => ({
      spend,
      impressions,
      reach,
      clicks,
      landingPageViews,
      checkouts,
      purchases,
      revenue,
    });
    const rows = [
      { date: '2026-09-01', creativeId: hookA._id, ...funnel(1000, 40000, 30000, 800, 600, 60, 20, 10000) },
      { date: '2026-09-03', creativeId: hookB._id, ...funnel(500, 20000, 15000, 300, 200, 20, 5, 2500) },
      { date: '2026-09-08', experimentId: retarget._id, ...funnel(300, 10000, 8000, 200, 150, 10, 3, 1500) },
      { date: '2026-09-09', creativeId: hookC._id, ...funnel(2000, 50000, 40000, 1000, 700, 50, 10, 10000) },
      { date: '2026-08-25', creativeId: hookA._id, ...funnel(800, 32000, 25000, 640, 500, 40, 10, 5000) },
      { date: '2026-08-31', productId: beta._id, ...funnel(1200, 30000, 22000, 600, 400, 30, 8, 8000) },
      { date: '2026-09-15', creativeId: hookC._id, ...funnel(100, 5000, 4000, 100, 80, 5, 1, 1000) },
    ];
    for (const row of rows) await create('/metrics', row);
  });

  describe('summary', () => {
    it('totals the range, applies product costs and compares with the previous period', async () => {
      const body = await get('/analytics/summary?from=2026-09-01&to=2026-09-10');
      expect(body.range).toEqual({ from: '2026-09-01', to: '2026-09-10' });
      expect(body.previousRange).toEqual({ from: '2026-08-22', to: '2026-08-31' });
      expect(body.current).toEqual({
        spend: 3800,
        impressions: 120000,
        reach: 93000,
        clicks: 2300,
        landingPageViews: 1650,
        checkouts: 140,
        purchases: 38,
        revenue: 24000,
        fees: 580,
        refunds: 700,
        otherCosts: 280,
        variableCosts: 1560,
        contribution: 18640,
        contributionMargin: 77.7,
        ctr: 1.92,
        cpc: 1.65,
        cpm: 31.67,
        checkoutRate: 8.48,
        conversionRate: 2.3,
        cac: 100,
        roas: 6.32,
        aov: 631.58,
      });
      expect(body.previous).toEqual({
        spend: 2000,
        impressions: 62000,
        reach: 47000,
        clicks: 1240,
        landingPageViews: 900,
        checkouts: 70,
        purchases: 18,
        revenue: 13000,
        fees: 340,
        refunds: 250,
        otherCosts: 100,
        variableCosts: 690,
        contribution: 10310,
        contributionMargin: 79.3,
        ctr: 2,
        cpc: 1.61,
        cpm: 32.26,
        checkoutRate: 7.78,
        conversionRate: 2,
        cac: 111.11,
        roas: 6.5,
        aov: 722.22,
      });
      expect(body.change).toEqual({
        spend: 90,
        impressions: 93.5,
        reach: 97.9,
        clicks: 85.5,
        landingPageViews: 83.3,
        checkouts: 100,
        purchases: 111.1,
        revenue: 84.6,
        fees: 70.6,
        refunds: 180,
        otherCosts: 180,
        variableCosts: 126.1,
        contribution: 80.8,
        contributionMargin: -2,
        ctr: -4,
        cpc: 2.5,
        cpm: -1.8,
        checkoutRate: 9,
        conversionRate: 15,
        cac: -10,
        roas: -2.8,
        aov: -12.6,
      });
    });

    it('filters by product, experiment, creative and campaign', async () => {
      const current = async (query) => (await get(`/analytics/summary?from=2026-09-01&to=2026-09-10&${query}`)).current;
      expect(await current(`productId=${alpha._id}`)).toMatchObject({
        spend: 1800,
        revenue: 14000,
        purchases: 28,
        fees: 280,
        refunds: 700,
        otherCosts: 280,
        contribution: 10940,
        cac: 64.29,
        roas: 7.78,
      });
      expect(await current(`experimentId=${launch._id}`)).toMatchObject({
        spend: 1500,
        revenue: 12500,
        purchases: 25,
        cac: 60,
        roas: 8.33,
      });
      expect(await current(`creativeId=${hookA._id}`)).toMatchObject({ spend: 1000, revenue: 10000, purchases: 20 });
      expect(await current('campaign=alpha-launch')).toMatchObject({ spend: 1500, revenue: 12500 });
      expect(await current(`productId=${gamma._id}`)).toEqual(ZERO);
    });

    it('returns open-ended totals without a comparison', async () => {
      const body = await get('/analytics/summary');
      expect(body).toMatchObject({ range: { from: null, to: null }, previousRange: null, previous: null, change: null });
      expect(body.current).toMatchObject({ spend: 5900, revenue: 38000, purchases: 57 });
      const since = await get('/analytics/summary?from=2026-09-08');
      expect(since).toMatchObject({ range: { from: '2026-09-08', to: null }, previousRange: null, previous: null, change: null });
      expect(since.current).toMatchObject({ spend: 2400, revenue: 12500, purchases: 14 });
    });

    it('swaps a reversed range and validates filters', async () => {
      const body = await get('/analytics/summary?from=2026-09-10&to=2026-09-01');
      expect(body.range).toEqual({ from: '2026-09-01', to: '2026-09-10' });
      expect(body.current.spend).toBe(3800);
      const bad = await api.get('/analytics/summary?from=2026-02-30&productId=abc');
      expect(bad.status).toBe(400);
      expect(bad.body).toEqual({
        error: { message: 'Invalid filters', fields: { from: 'Use a YYYY-MM-DD date', productId: 'Invalid id' } },
      });
    });
  });

  describe('timeseries', () => {
    it('fills every day of the range', async () => {
      const body = await get('/analytics/timeseries?from=2026-09-01&to=2026-09-10&granularity=day');
      expect(body).toMatchObject({ from: '2026-09-01', to: '2026-09-10', granularity: 'day' });
      expect(body.points.map((p) => [p.key, p.spend])).toEqual([
        ['2026-09-01', 1000],
        ['2026-09-02', 0],
        ['2026-09-03', 500],
        ['2026-09-04', 0],
        ['2026-09-05', 0],
        ['2026-09-06', 0],
        ['2026-09-07', 0],
        ['2026-09-08', 300],
        ['2026-09-09', 2000],
        ['2026-09-10', 0],
      ]);
      expect(body.points[0]).toEqual({
        key: '2026-09-01',
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
      expect(body.points[1]).toEqual({ key: '2026-09-02', ...ZERO });
    });

    it('picks daily buckets for short ranges', async () => {
      expect((await get('/analytics/timeseries?from=2026-09-01&to=2026-09-10')).granularity).toBe('day');
    });

    it('buckets weeks from Monday', async () => {
      const body = await get('/analytics/timeseries?from=2026-08-25&to=2026-09-15&granularity=week');
      expect(body.points.map(({ key, spend, revenue, purchases }) => ({ key, spend, revenue, purchases }))).toEqual([
        { key: '2026-08-24', spend: 800, revenue: 5000, purchases: 10 },
        { key: '2026-08-31', spend: 2700, revenue: 20500, purchases: 33 },
        { key: '2026-09-07', spend: 2300, revenue: 11500, purchases: 13 },
        { key: '2026-09-14', spend: 100, revenue: 1000, purchases: 1 },
      ]);
    });

    it('buckets months', async () => {
      const body = await get('/analytics/timeseries?from=2026-08-01&to=2026-09-30&granularity=month');
      expect(body.points.map(({ key, spend, revenue }) => ({ key, spend, revenue }))).toEqual([
        { key: '2026-08-01', spend: 2000, revenue: 13000 },
        { key: '2026-09-01', spend: 3900, revenue: 25000 },
      ]);
    });

    it('uses the data bounds when no range is given', async () => {
      const body = await get(`/analytics/timeseries?productId=${beta._id}`);
      expect(body).toMatchObject({ from: '2026-08-31', to: '2026-09-15', granularity: 'day' });
      expect(body.points).toHaveLength(16);
      expect(await get(`/analytics/timeseries?productId=${gamma._id}`)).toEqual({ from: null, to: null, granularity: 'day', points: [] });
      const since = await get('/analytics/timeseries?from=2026-09-08&granularity=week');
      expect(since).toMatchObject({ from: '2026-09-08', to: '2026-09-15', granularity: 'week' });
      expect(since.points.map(({ key, spend }) => [key, spend])).toEqual([
        ['2026-09-07', 2300],
        ['2026-09-14', 100],
      ]);
    });
  });

  describe('performance', () => {
    it('ranks products by revenue and flags products without data', async () => {
      const { items } = await get('/analytics/products?from=2026-09-01&to=2026-09-10');
      expect(items.map((p) => [p.name, p.hasData, p.revenue, p.spend])).toEqual([
        ['Alpha', true, 14000, 1800],
        ['Beta', true, 10000, 2000],
        ['Gamma', false, 0, 0],
      ]);
      expect(items[1]).toMatchObject({ status: 'testing', price: 1000, version: 'v1', fees: 300, contribution: 7700, cac: 200, roas: 5 });
      expect(items[2]).toMatchObject({ cac: null, roas: null });
      expect((await get('/analytics/products?status=researching')).items.map((p) => p.name)).toEqual(['Draft']);
    });

    it('returns experiment performance with products and creative counts', async () => {
      const { items } = await get('/analytics/experiments?from=2026-09-01&to=2026-09-10');
      const byName = Object.fromEntries(items.map((x) => [x.name, x]));
      expect(Object.keys(byName).sort()).toEqual(['Alpha launch', 'Alpha retarget', 'Beta launch']);
      expect(byName['Alpha launch']).toMatchObject({
        creativeCount: 2,
        hasData: true,
        spend: 1500,
        revenue: 12500,
        purchases: 25,
        cac: 60,
        product: { _id: alpha._id, name: 'Alpha', status: 'testing', price: 499 },
      });
      expect(byName['Alpha retarget']).toMatchObject({ creativeCount: 0, hasData: true, spend: 300, revenue: 1500 });
      expect(byName['Beta launch']).toMatchObject({ creativeCount: 1, hasData: true, spend: 2000, revenue: 10000 });
    });

    it('selects experiments by ids, status list and product', async () => {
      const byIds = await get(`/analytics/experiments?ids=${launch._id},${betaLaunch._id}`);
      expect(names(byIds.items)).toEqual(['Alpha launch', 'Beta launch']);
      expect(byIds.items.find((x) => x.name === 'Beta launch')).toMatchObject({ spend: 2100, revenue: 11000 });
      expect(names((await get('/analytics/experiments?status=running,completed')).items)).toEqual(['Alpha launch', 'Alpha retarget']);
      expect(names((await get(`/analytics/experiments?productId=${beta._id}`)).items)).toEqual(['Beta launch']);
      const quiet = await get(`/analytics/experiments?ids=${betaLaunch._id}&from=2026-09-10&to=2026-09-14`);
      expect(quiet.items[0]).toMatchObject({ hasData: false, spend: 0, cac: null });
    });

    it('returns creative performance by experiment, product or ids', async () => {
      const { items } = await get(`/analytics/creatives?experimentId=${launch._id}&from=2026-09-01&to=2026-09-10`);
      expect(items.map((c) => [c.name, c.experimentName, c.hasData, c.spend, c.revenue, c.cac]).sort()).toEqual([
        ['Hook A', 'Alpha launch', true, 1000, 10000, 50],
        ['Hook B', 'Alpha launch', true, 500, 2500, 100],
      ]);
      const byProduct = await get(`/analytics/creatives?productId=${beta._id}`);
      expect(byProduct.items.map((c) => [c.name, c.spend, c.revenue])).toEqual([['Hook C', 2100, 11000]]);
      expect(names((await get(`/analytics/creatives?ids=${hookB._id}`)).items)).toEqual(['Hook B']);
    });
  });
});

describe('lifecycle', () => {
  beforeAll(resetDb);

  it('counts products and unconverted ideas per stage', async () => {
    for (const status of ['testing', 'testing', 'scaling', 'killed', 'ready_to_test']) await createProduct({ status });
    for (const status of ['idea', 'idea', 'researching', 'ready_to_test', 'killed']) {
      await create('/ideas', { name: `Idea ${status}`, status });
    }
    const converted = await create('/ideas', { name: 'Converted' });
    await api.post(`/ideas/${converted._id}/convert`, {});

    expect((await get('/analytics/lifecycle')).stages).toEqual([
      { status: 'idea', products: 0, ideas: 2, count: 2 },
      { status: 'researching', products: 0, ideas: 1, count: 1 },
      { status: 'ready_to_test', products: 2, ideas: 1, count: 3 },
      { status: 'testing', products: 2, ideas: 0, count: 2 },
      { status: 'iterating', products: 0, ideas: 0, count: 0 },
      { status: 'scaling', products: 1, ideas: 0, count: 1 },
      { status: 'paused', products: 0, ideas: 0, count: 0 },
      { status: 'killed', products: 1, ideas: 1, count: 2 },
    ]);
  });
});

describe('scaling', () => {
  let scaler;

  beforeAll(async () => {
    await resetDb();
    setNow('2026-09-20T06:30:00.000Z');
    scaler = await createProduct({
      name: 'Scaler',
      price: 999,
      category: 'Templates',
      status: 'testing',
      costs: { paymentFeePct: 0 },
      budget: { daily: 2000, monthly: 60000 },
    });
    const days = [
      ['2026-08-30', 500, 1],
      ['2026-09-05', 1000, 3],
      ['2026-09-12', 1500, 4],
      ['2026-09-15', 2000, 5],
      ['2026-09-20', 700, 2],
    ];
    for (const [date, spend, purchases] of days) {
      await create('/metrics', { productId: scaler._id, date, spend, purchases, revenue: purchases * 999 });
    }
    await create('/decisions', { productId: scaler._id, decision: 'scale', reason: 'CAC under target', date: '2026-09-12' });
    setNow('2026-09-20T06:31:00.000Z');
    const fresh = await createProduct({ name: 'Fresh', status: 'testing' });
    await api.patch(`/products/${fresh._id}`, { status: 'scaling' });
    await createProduct({ name: 'Still testing', status: 'testing' });
  });

  it('lists scaling products in the order they started scaling', async () => {
    const { items } = await get('/analytics/scaling');
    expect(items.map((i) => [i.product.name, i.since])).toEqual([
      ['Scaler', '2026-09-12'],
      ['Fresh', '2026-09-20'],
    ]);
    expect(items[1].today).toMatchObject({ spend: 0, purchases: 0, cac: null });
  });

  it('reports today, last 7 days, month to date and since scaling against the budget', async () => {
    const [s] = (await get('/analytics/scaling')).items;
    expect(s.product).toEqual({
      _id: scaler._id,
      name: 'Scaler',
      price: 999,
      category: 'Templates',
      version: 'v1',
      budget: { daily: 2000, monthly: 60000 },
      costs: { paymentFeePct: 0, refundRatePct: 0, variableCostPerSale: 0 },
      desiredMarginPct: 20,
    });
    expect(s.today).toMatchObject({ spend: 700, purchases: 2, revenue: 1998, cac: 350 });
    expect(s.last7).toMatchObject({ spend: 2700, purchases: 7, revenue: 6993, contribution: 4293 });
    expect(s.mtd).toMatchObject({ spend: 5200, purchases: 14, revenue: 13986 });
    expect(s.sinceScaling).toMatchObject({ spend: 4200, purchases: 11, revenue: 10989 });
    expect(s.perDay).toEqual({ spend: 385.71, purchases: 1, revenue: 999, contribution: 613.29 });
    expect(s.month).toEqual({ day: 20, days: 30 });
    expect(s.series).toHaveLength(30);
    expect([s.series[0].key, s.series.at(-1).key]).toEqual(['2026-08-22', '2026-09-20']);
    expect(s.series.find((p) => p.key === '2026-08-30')).toMatchObject({ spend: 500, purchases: 1 });
  });
});

describe('graveyard', () => {
  beforeAll(async () => {
    await resetDb();
    setNow('2026-09-01T06:30:00.000Z');
    const zeroFees = { costs: { paymentFeePct: 0 } };
    const decided = await createProduct({ name: 'Decided', status: 'testing', category: 'Courses', price: 999, ...zeroFees });
    const manual = await createProduct({ name: 'Manual', status: 'testing', ...zeroFees });
    const alive = await createProduct({ name: 'Alive', status: 'testing' });
    const first = await createExperiment(decided._id, { name: 'D1' });
    await createExperiment(decided._id, { name: 'D2' });
    const offer = await createExperiment(manual._id, { name: 'M1' });
    await create('/metrics', { experimentId: first._id, date: '2026-09-02', spend: 3000, purchases: 2, revenue: 1000 });
    await create('/metrics', { experimentId: offer._id, date: '2026-09-03', spend: 400, purchases: 1, revenue: 500 });
    await create('/metrics', { productId: alive._id, date: '2026-09-03', spend: 50, purchases: 1, revenue: 499 });
    setNow('2026-09-05T06:30:00.000Z');
    await create('/decisions', {
      productId: manual._id,
      experimentId: offer._id,
      decision: 'kill',
      reason: 'Offer did not convert',
      notes: 'Try a lower price',
      date: '2026-09-05',
    });
    setNow('2026-09-11T06:30:00.000Z');
    await api.patch(`/products/${manual._id}`, { status: 'killed' });
    setNow('2026-09-21T06:30:00.000Z');
    const kill = { decision: 'kill', reason: 'CAC too high', notes: 'Audience too broad', date: '2026-09-21' };
    await create('/decisions', { productId: decided._id, ...kill });
    await create('/ideas', { name: 'Dead idea', status: 'killed', category: 'Courses', notes: 'Saturated niche' });
    await create('/ideas', { name: 'Live idea' });
  });

  it('lists killed products newest first with lifespan, experiments and totals', async () => {
    const { items, totals } = await get('/analytics/graveyard');
    expect(items.map((i) => i.name)).toEqual(['Decided', 'Manual']);
    expect(items[0]).toMatchObject({
      category: 'Courses',
      price: 999,
      killedAt: '2026-09-21T06:30:00.000Z',
      killReason: 'CAC too high',
      learnings: 'Audience too broad',
      experiments: 2,
      lifespanDays: 20,
      spend: 3000,
      revenue: 1000,
      purchases: 2,
      contribution: -2000,
      cac: 1500,
      roas: 0.33,
    });
    expect(items[1]).toMatchObject({ experiments: 1, lifespanDays: 10, spend: 400, revenue: 500, contribution: 100 });
    expect(totals).toMatchObject({ products: 2, spend: 3400, revenue: 1500, purchases: 3, contribution: -1900, cac: 1133.33 });
  });

  it('falls back to the kill decision for the reason and learnings', async () => {
    const { items } = await get('/analytics/graveyard');
    expect(items[1]).toMatchObject({ name: 'Manual', killReason: 'Offer did not convert', learnings: 'Try a lower price' });
    const manual = (await get('/products?q=Manual')).items[0];
    expect(manual).toMatchObject({ killReason: '', learnings: '' });
  });

  it('lists killed ideas', async () => {
    const { ideas } = await get('/analytics/graveyard');
    expect(ideas).toEqual([
      { _id: expect.any(String), name: 'Dead idea', category: 'Courses', notes: 'Saturated niche', updatedAt: '2026-09-21T06:30:00.000Z' },
    ]);
  });
});

describe('orders and customers', () => {
  let planner;
  let course;
  let launch;

  beforeAll(async () => {
    await resetDb();
    planner = await createProduct({ name: 'Planner', price: 500 });
    course = await createProduct({ name: 'Course', price: 1000 });
    launch = await createExperiment(planner._id, { name: 'Planner launch' });
    const item = (kind, amount) => ({ kind, amount });
    const order = (product, name, items, date, extra) =>
      create('/orders', { productId: product._id, customer: { email: `${name}@example.com`, name }, items, date, ...extra });
    const bundle = [item('main', 1000), item('bundle', 1500), item('bump', 100), item('bump', 50)];
    await order(planner, 'asha', [item('main', 500), item('bump', 100)], '2026-09-01', { campaign: 'launch' });
    await order(planner, 'bala', [item('main', 500), item('upsell', 300)], '2026-09-02', { refundStatus: 'full' });
    await order(planner, 'asha', [item('main', 500)], '2026-09-10T20:00:00Z');
    await order(course, 'chen', bundle, '2026-09-05', { refundStatus: 'partial', refundAmount: 200 });
    await order(planner, 'chen', [item('main', 500)], '2026-09-03', { paymentStatus: 'pending' });
    await order(planner, 'bala', [item('main', 500)], '2026-09-04', { paymentStatus: 'failed' });
    await order(course, 'asha', [item('main', 1000)], '2026-08-20');
    await order(planner, 'dev', [item('main', 500)], '2026-09-12', { experimentId: launch._id });
  });

  it('summarises paid orders with kinds, take rates and refunds', async () => {
    const { totals } = await get('/analytics/orders?from=2026-09-01&to=2026-09-30');
    expect(totals).toEqual({
      orders: 5,
      customers: 4,
      revenue: 5050,
      refunds: 1000,
      netRevenue: 4050,
      refundRate: 19.8,
      aov: 1010,
      frontEndAov: 600,
      bumpRate: 40,
      upsellRate: 20,
      bundleRate: 20,
      kinds: {
        main: { orders: 5, revenue: 3000 },
        bump: { orders: 2, revenue: 250 },
        upsell: { orders: 1, revenue: 300 },
        bundle: { orders: 1, revenue: 1500 },
      },
    });
  });

  it('buckets orders by day in the configured time zone', async () => {
    const { granularity, series } = await get('/analytics/orders?from=2026-09-01&to=2026-09-30&granularity=day');
    expect(granularity).toBe('day');
    expect(series).toHaveLength(30);
    const byKey = Object.fromEntries(series.map((p) => [p.key, p]));
    const oneOrder = (key, revenue, kinds) => ({ key, orders: 1, revenue, aov: revenue, main: 0, bump: 0, upsell: 0, bundle: 0, ...kinds });
    expect(byKey['2026-09-01']).toEqual(oneOrder('2026-09-01', 600, { main: 500, bump: 100 }));
    expect(byKey['2026-09-02']).toEqual(oneOrder('2026-09-02', 800, { main: 500, upsell: 300 }));
    expect(byKey['2026-09-05']).toEqual(oneOrder('2026-09-05', 2650, { main: 1000, bump: 150, bundle: 1500 }));
    expect(byKey['2026-09-10']).toMatchObject({ orders: 0, revenue: 0, aov: null });
    expect(byKey['2026-09-11']).toMatchObject({ orders: 1, revenue: 500 });
  });

  it('buckets orders by week and month', async () => {
    const weeks = await get('/analytics/orders?from=2026-09-01&to=2026-09-30&granularity=week');
    expect(weeks.series.map(({ key, orders, revenue }) => [key, orders, revenue])).toEqual([
      ['2026-08-31', 3, 4050],
      ['2026-09-07', 2, 1000],
      ['2026-09-14', 0, 0],
      ['2026-09-21', 0, 0],
      ['2026-09-28', 0, 0],
    ]);
    const months = await get('/analytics/orders?from=2026-08-01&to=2026-09-30&granularity=month');
    expect(months.series.map(({ key, orders, revenue }) => [key, orders, revenue])).toEqual([
      ['2026-08-01', 1, 1000],
      ['2026-09-01', 5, 5050],
    ]);
  });

  it('uses the order dates as the range when none is given', async () => {
    const body = await get('/analytics/orders');
    expect(body.totals).toMatchObject({ orders: 6, revenue: 6050 });
    expect(body.granularity).toBe('day');
    expect(body.series).toHaveLength(24);
    expect([body.series[0].key, body.series.at(-1).key]).toEqual(['2026-08-20', '2026-09-12']);
  });

  it('filters orders by product, experiment and campaign', async () => {
    const totals = async (query) => (await get(`/analytics/orders?from=2026-09-01&to=2026-09-30&${query}`)).totals;
    expect(await totals(`productId=${course._id}`)).toMatchObject({
      orders: 1,
      revenue: 2650,
      refunds: 200,
      netRevenue: 2450,
      refundRate: 7.5,
      frontEndAov: 1000,
      bumpRate: 100,
      bundleRate: 100,
      upsellRate: 0,
    });
    expect(await totals(`experimentId=${launch._id}`)).toMatchObject({ orders: 1, revenue: 500 });
    expect(await totals('campaign=launch')).toMatchObject({ orders: 1, revenue: 600 });
  });

  it('computes repeat buyers, product ownership and overlap', async () => {
    const body = await get('/analytics/customers');
    expect(body.totals).toEqual({
      customers: 4,
      repeatCustomers: 1,
      repeatRate: 25,
      multiProductCustomers: 1,
      avgValue: 1262.5,
      revenue: 5050,
    });
    expect(body.productsOwned).toEqual([
      { bucket: '1', count: 3 },
      { bucket: '2', count: 1 },
      { bucket: '3+', count: 0 },
    ]);
    expect(body.topCustomers.map((c) => [c.email, c.totalSpent, c.orderCount, c.products])).toEqual([
      ['chen@example.com', 2450, 1, 1],
      ['asha@example.com', 2100, 3, 2],
      ['dev@example.com', 500, 1, 1],
      ['bala@example.com', 0, 1, 1],
    ]);
    expect(body.overlap).toEqual({
      products: [
        { _id: planner._id, name: 'Planner' },
        { _id: course._id, name: 'Course' },
      ],
      matrix: [
        [3, 1],
        [1, 2],
      ],
    });
    expect(body.newCustomers).toEqual({ granularity: null, series: [] });
  });

  it('counts new customers by first purchase in the range', async () => {
    const { newCustomers } = await get('/analytics/customers?from=2026-09-01&to=2026-09-30&granularity=week');
    expect(newCustomers).toEqual({
      granularity: 'week',
      series: [
        { key: '2026-08-31', customers: 2 },
        { key: '2026-09-07', customers: 1 },
        { key: '2026-09-14', customers: 0 },
        { key: '2026-09-21', customers: 0 },
        { key: '2026-09-28', customers: 0 },
      ],
    });
  });

  it('follows the configured time zone for day boundaries', async () => {
    const ordersOn = async (day) => (await get(`/analytics/orders?from=${day}&to=${day}`)).totals.orders;
    const counts = () => Promise.all(['2026-09-04', '2026-09-05', '2026-09-10', '2026-09-12'].map(ordersOn));
    expect(await counts()).toEqual([0, 1, 0, 1]);
    try {
      await api.patch('/settings', { timezone: 'UTC' });
      expect(await counts()).toEqual([1, 0, 1, 0]);
    } finally {
      await api.patch('/settings', { timezone: 'Asia/Kolkata' });
    }
  });
});

describe('activity', () => {
  let planner;

  beforeAll(async () => {
    await resetDb();
    setNow('2026-09-09T19:00:00.000Z');
    await create('/ideas', { name: 'Journal' });
    const at = (time) => setNow(`2026-09-10T${time}:00.000Z`);
    at('05:00');
    planner = await createProduct({ name: 'Planner' });
    at('06:00');
    const x = await createExperiment(planner._id, { name: 'Hooks' });
    at('07:00');
    await createCreative(x._id, { name: 'Hook A' });
    at('08:00');
    await create('/decisions', { productId: planner._id, decision: 'scale', reason: 'Cheap CAC', date: '2026-09-09', applyStatus: false });
    at('09:00');
    await api.patch(`/products/${planner._id}`, { status: 'scaling' });
    at('19:00');
    await create(`/products/${planner._id}/versions`, { label: 'v2', date: '2026-09-11' });
  });

  it('merges recent events newest first with local dates and product names', async () => {
    const { items } = await get('/analytics/activity');
    expect(items.map(({ type, at, date, title, productName }) => [type, at, date, title, productName])).toEqual([
      ['version', '2026-09-10T19:00:00.000Z', '2026-09-11', 'Version v2 released', 'Planner'],
      ['status', '2026-09-10T09:00:00.000Z', '2026-09-10', 'Ready to Test → Scaling', 'Planner'],
      ['decision', '2026-09-10T08:00:00.000Z', '2026-09-09', 'Decision: Scale', 'Planner'],
      ['creative', '2026-09-10T07:00:00.000Z', '2026-09-10', 'Creative added: Hook A', 'Planner'],
      ['experiment', '2026-09-10T06:00:00.000Z', '2026-09-10', 'Experiment created: Hooks', 'Planner'],
      ['created', '2026-09-10T05:00:00.000Z', '2026-09-10', 'Product created', 'Planner'],
      ['idea', '2026-09-09T19:00:00.000Z', '2026-09-10', 'Idea captured: Journal', ''],
    ]);
    expect(items[1]).toMatchObject({ from: 'ready_to_test', to: 'scaling', productId: planner._id });
    expect(items[2]).toMatchObject({ decision: 'scale', note: 'Cheap CAC' });
  });

  it('limits the feed', async () => {
    expect((await get('/analytics/activity?limit=2')).items.map((i) => i.type)).toEqual(['version', 'status']);
  });
});

describe('early-stage products', () => {
  beforeAll(async () => {
    await resetDb();
    const researching = await createProduct({ name: 'Researching', status: 'researching' });
    const old = await createProduct({ name: 'Old idea', status: 'idea' });
    const live = await createProduct({ name: 'Live', status: 'testing' });
    await createProduct({ name: 'Bare idea', status: 'idea' });
    await create('/metrics', { productId: researching._id, date: '2026-09-05', spend: 2000, purchases: 14, revenue: 2386 });
    await create('/metrics', { productId: old._id, date: '2026-08-01', spend: 300, purchases: 1, revenue: 499 });
    await create('/metrics', { productId: live._id, date: '2026-09-06', spend: 100 });
  });

  it('includes idea and researching products that have data in the range', async () => {
    const rows = async (query) => (await get(`/analytics/products?${query}`)).items.map((p) => [p.name, p.status, p.hasData, p.spend]);
    expect(await rows('from=2026-09-01&to=2026-09-10')).toEqual([
      ['Researching', 'researching', true, 2000],
      ['Live', 'testing', true, 100],
    ]);
    expect(await rows('')).toEqual([
      ['Researching', 'researching', true, 2000],
      ['Old idea', 'idea', true, 300],
      ['Live', 'testing', true, 100],
    ]);
    expect((await rows('status=idea')).map(([name]) => name).sort()).toEqual(['Bare idea', 'Old idea']);
  });
});

describe('back-dated decisions', () => {
  beforeAll(async () => {
    await resetDb();
    setNow('2026-09-01T06:30:00.000Z');
    const [early, late, doomed] = await Promise.all(['Early', 'Late', 'Doomed'].map((name) => createProduct({ name, status: 'testing' })));
    setNow('2026-09-30T06:30:00.000Z');
    await create('/decisions', { productId: late._id, decision: 'scale', reason: 'Recorded first', date: '2026-09-20' });
    setNow('2026-09-30T06:31:00.000Z');
    await create('/decisions', { productId: early._id, decision: 'scale', reason: 'Recorded later', date: '2026-09-10' });
    await create('/decisions', { productId: doomed._id, decision: 'kill', reason: 'No buyers', date: '2026-09-05' });
  });

  it('lists scaling products by the date their decision took effect', async () => {
    const { items } = await get('/analytics/scaling');
    expect(items.map((i) => [i.product.name, i.since])).toEqual([
      ['Early', '2026-09-10'],
      ['Late', '2026-09-20'],
    ]);
  });

  it('dates the kill and lifespan from the decision date', async () => {
    const { items } = await get('/analytics/graveyard');
    expect(items.map(({ name, killedAt, lifespanDays }) => ({ name, killedAt, lifespanDays }))).toEqual([
      { name: 'Doomed', killedAt: '2026-09-04T18:30:00.000Z', lifespanDays: 4 },
    ]);
  });
});

describe('sales from orders', () => {
  let store;
  let launch;
  const range = 'from=2026-09-01&to=2026-09-30';

  beforeAll(async () => {
    await resetDb();
    store = await createProduct({ name: 'Store', price: 400, costs: { paymentFeePct: 2, refundRatePct: 0, variableCostPerSale: 0 } });
    const adsOnly = await createProduct({ name: 'Ads only', price: 1000 });
    const ordersOnly = await createProduct({ name: 'Orders only', price: 700 });
    launch = await createExperiment(store._id, { name: 'Store launch', campaign: 'store-launch' });
    const order = (product, name, amount, date, extra) =>
      create('/orders', { productId: product._id, customer: { email: `${name}@example.com`, name }, items: [{ kind: 'main', amount }], date, ...extra });
    await order(store, 'asha', 400, '2026-09-01');
    await order(store, 'bala', 500, '2026-09-01T20:00:00Z');
    await order(store, 'chen', 400, '2026-09-03', { paymentStatus: 'pending' });
    await order(store, 'dev', 400, '2026-09-04', { paymentStatus: 'failed' });
    await order(store, 'esha', 400, '2026-09-06');
    await order(ordersOnly, 'farah', 700, '2026-09-05');
    const ads = { impressions: 10000, clicks: 200, landingPageViews: 150, checkouts: 10 };
    await create('/metrics', { productId: store._id, date: '2026-09-01', spend: 300, ...ads, purchases: 9, revenue: 9000 });
    await create('/metrics', { experimentId: launch._id, campaign: 'store-launch', date: '2026-09-02', spend: 200, ...ads, purchases: 4, revenue: 1600 });
    await create('/metrics', { productId: adsOnly._id, date: '2026-09-02', spend: 100, purchases: 2, revenue: 2000 });
  });

  it('takes purchases and revenue from paid orders for products that have orders', async () => {
    const { current } = await get(`/analytics/summary?productId=${store._id}&${range}`);
    expect(current).toMatchObject({
      spend: 500,
      impressions: 20000,
      clicks: 400,
      landingPageViews: 300,
      checkouts: 20,
      purchases: 3,
      revenue: 1300,
      fees: 26,
      contribution: 774,
      aov: 433.33,
      cac: 166.67,
      roas: 2.6,
      conversionRate: 1,
    });
  });

  it('combines order-backed and ad-only products in the totals', async () => {
    const { current } = await get(`/analytics/summary?${range}`);
    expect(current).toMatchObject({ spend: 600, purchases: 6, revenue: 4000 });
  });

  it('keeps ad results for experiment and campaign views', async () => {
    const expected = { spend: 200, purchases: 4, revenue: 1600 };
    expect((await get(`/analytics/summary?experimentId=${launch._id}&${range}`)).current).toMatchObject(expected);
    expect((await get(`/analytics/summary?campaign=store-launch&${range}`)).current).toMatchObject(expected);
  });

  it('buckets order sales by local day and covers order dates when no range is given', async () => {
    const { points } = await get(`/analytics/timeseries?productId=${store._id}&from=2026-09-01&to=2026-09-03&granularity=day`);
    expect(points.map(({ key, spend, purchases, revenue }) => [key, spend, purchases, revenue])).toEqual([
      ['2026-09-01', 300, 1, 400],
      ['2026-09-02', 200, 1, 500],
      ['2026-09-03', 0, 0, 0],
    ]);
    const all = await get(`/analytics/timeseries?productId=${store._id}&granularity=day`);
    expect([all.from, all.to]).toEqual(['2026-09-01', '2026-09-06']);
  });

  it('ranks products with order sales', async () => {
    const { items } = await get(`/analytics/products?${range}`);
    expect(items.map(({ name, hasData, purchases, revenue }) => [name, hasData, purchases, revenue])).toEqual([
      ['Ads only', true, 2, 2000],
      ['Store', true, 3, 1300],
      ['Orders only', true, 1, 700],
    ]);
  });
});
