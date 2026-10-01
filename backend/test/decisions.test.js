import { beforeAll, describe, expect, it } from 'vitest';
import { MISSING_ID, NOW, api, create, createExperiment, createProduct, setNow, setupApi } from './setup.js';

setupApi();

const TODAY = '2026-09-29';
const EVIDENCE = ['purchases', 'revenue', 'spend', 'cac', 'roas', 'conversionRate', 'aov', 'ctr', 'contribution'];
const pick = (totals) => Object.fromEntries(EVIDENCE.map((k) => [k, totals[k]]));
const zeroCosts = { paymentFeePct: 0, refundRatePct: 0, variableCostPerSale: 0 };
const decide = (body) => api.post('/decisions', { reason: 'Numbers reviewed', date: '2026-09-10', ...body });
const productOf = async (id) => (await api.get(`/products/${id}`)).body;

let planner;
let hooks;

beforeAll(async () => {
  planner = await createProduct({ name: 'Planner', status: 'testing', costs: zeroCosts });
  hooks = await createExperiment(planner._id, { name: 'Hook test' });
  await create('/metrics', {
    experimentId: hooks._id,
    date: '2026-09-01',
    spend: 1000,
    impressions: 50000,
    clicks: 1000,
    landingPageViews: 800,
    purchases: 10,
    revenue: 5000,
  });
  await create('/metrics', {
    productId: planner._id,
    date: '2026-09-02',
    spend: 500,
    impressions: 20000,
    clicks: 300,
    landingPageViews: 200,
    purchases: 2,
    revenue: 1000,
  });
});

describe('evidence', () => {
  it('snapshots the product totals at decision time', async () => {
    const summary = (await api.get(`/analytics/summary?productId=${planner._id}`)).body.current;
    const res = await decide({ productId: planner._id, decision: 'continue', applyStatus: false });
    expect(res.status).toBe(201);
    const evidence = {
      purchases: 12,
      revenue: 6000,
      spend: 1500,
      cac: 125,
      roas: 4,
      conversionRate: 1.2,
      aov: 500,
      ctr: 1.86,
      contribution: 4500,
    };
    expect(res.body.evidence).toEqual(evidence);
    expect(pick(summary)).toEqual(evidence);

    await create('/metrics', { productId: planner._id, date: '2026-09-03', spend: 500, purchases: 1, revenue: 500 });
    const later = (await api.get(`/analytics/summary?productId=${planner._id}`)).body.current;
    expect(later).toMatchObject({ spend: 2000, purchases: 13 });
    const [stored] = (await api.get(`/decisions?productId=${planner._id}`)).body.items;
    expect(stored.evidence).toEqual(evidence);
  });

  it('uses the experiment totals for experiment decisions', async () => {
    const res = await decide({ productId: planner._id, experimentId: hooks._id, decision: 'continue' });
    expect(res.body.evidence).toEqual({
      purchases: 10,
      revenue: 5000,
      spend: 1000,
      cac: 100,
      roas: 5,
      conversionRate: 1.25,
      aov: 500,
      ctr: 2,
      contribution: 4000,
    });
  });

  it('snapshots only the data up to the decision date', async () => {
    const product = await createProduct({ name: 'Dated', status: 'testing', costs: zeroCosts });
    await create('/metrics', { productId: product._id, date: '2026-09-04', spend: 400, purchases: 4, revenue: 2000 });
    await create('/metrics', { productId: product._id, date: '2026-09-12', spend: 600, purchases: 1, revenue: 500 });
    const res = await decide({ productId: product._id, decision: 'continue', date: '2026-09-08' });
    expect(res.body.evidence).toMatchObject({ purchases: 4, revenue: 2000, spend: 400, cac: 100, roas: 5, contribution: 1600 });
  });

  it('records null ratios for products without data', async () => {
    const empty = await createProduct({ name: 'Empty' });
    const res = await decide({ productId: empty._id, decision: 'pause' });
    expect(res.body.evidence).toEqual({
      purchases: 0,
      revenue: 0,
      spend: 0,
      cac: null,
      roas: null,
      conversionRate: null,
      aov: null,
      ctr: null,
      contribution: 0,
    });
  });
});

describe('status changes', () => {
  it('applies product-level decisions to the product status by default', async () => {
    const product = await createProduct({ status: 'testing' });
    const res = await decide({ productId: product._id, decision: 'iterate', reason: 'CAC above target', date: '2026-09-12' });
    expect(res.body).toMatchObject({ decision: 'iterate', experimentId: null, statusFrom: 'testing', statusTo: 'iterating' });
    expect((await productOf(product._id)).status).toBe('iterating');
    const [status] = (await api.get(`/products/${product._id}/timeline`)).body.items.filter((i) => i.type === 'status');
    expect(status).toMatchObject({
      date: '2026-09-12',
      from: 'testing',
      to: 'iterating',
      note: 'CAC above target',
      title: 'Testing → Iterating',
    });
  });

  it('leaves the product status alone for experiment-level decisions by default', async () => {
    const product = await createProduct({ status: 'testing' });
    const x = await createExperiment(product._id);
    const res = await decide({ productId: product._id, experimentId: x._id, decision: 'scale' });
    expect(res.body).toMatchObject({ experimentId: x._id, statusFrom: 'testing', statusTo: null });
    expect((await productOf(product._id)).status).toBe('testing');
  });

  it('follows an explicit applyStatus flag', async () => {
    const product = await createProduct({ status: 'testing' });
    const x = await createExperiment(product._id);
    const scaled = await decide({ productId: product._id, experimentId: x._id, decision: 'scale', applyStatus: true });
    expect(scaled.body).toMatchObject({ statusFrom: 'testing', statusTo: 'scaling' });
    expect((await productOf(product._id)).status).toBe('scaling');
    const held = await decide({ productId: product._id, decision: 'pause', applyStatus: false });
    expect(held.body).toMatchObject({ statusFrom: 'scaling', statusTo: null });
    expect((await productOf(product._id)).status).toBe('scaling');
  });

  it('kills the product with the reason and notes as learnings', async () => {
    const product = await createProduct({ status: 'testing' });
    const res = await decide({
      productId: product._id,
      decision: 'kill',
      reason: 'CAC too high',
      notes: 'Audience too broad',
      date: TODAY,
    });
    expect(res.body).toMatchObject({ statusFrom: 'testing', statusTo: 'killed' });
    const killed = await productOf(product._id);
    expect(killed).toMatchObject({ status: 'killed', killReason: 'CAC too high', learnings: 'Audience too broad', killedAt: NOW });
  });

  it('keeps existing learnings when killing', async () => {
    const product = await createProduct({ status: 'testing', learnings: 'Buyers wanted video' });
    await decide({ productId: product._id, decision: 'kill', reason: 'No margin', notes: 'Ignored' });
    expect(await productOf(product._id)).toMatchObject({ killReason: 'No margin', learnings: 'Buyers wanted video' });
  });

  it('dates a back-dated status change from the decision date', async () => {
    const product = await createProduct({ status: 'testing' });
    await decide({ productId: product._id, decision: 'kill', reason: 'Stalled', date: '2026-09-05' });
    const start = '2026-09-04T18:30:00.000Z';
    expect(await productOf(product._id)).toMatchObject({ status: 'killed', killedAt: start, statusChangedAt: start });
  });
});

describe('experiment status', () => {
  const statuses = async (productId) =>
    Object.fromEntries((await api.get(`/experiments?productId=${productId}`)).body.items.map((x) => [x.name, [x.status, x.endDate]]));

  it('stops the experiment a kill or pause decision is recorded on', async () => {
    const product = await createProduct({ status: 'testing' });
    const run = (name) => createExperiment(product._id, { name, status: 'running', startDate: '2026-09-01' });
    const [killed, paused, kept, planned] = await Promise.all(['Killed', 'Paused', 'Kept', 'Planned'].map(run));
    await api.patch(`/experiments/${planned._id}`, { status: 'planned', startDate: null });
    await decide({ productId: product._id, experimentId: killed._id, decision: 'kill', date: '2026-09-12' });
    await decide({ productId: product._id, experimentId: paused._id, decision: 'pause', date: '2026-09-14' });
    await decide({ productId: product._id, experimentId: kept._id, decision: 'iterate', date: '2026-09-15' });
    await decide({ productId: product._id, experimentId: planned._id, decision: 'pause', date: '2026-09-15' });
    expect(await statuses(product._id)).toEqual({
      Killed: ['stopped', '2026-09-12'],
      Paused: ['stopped', '2026-09-14'],
      Kept: ['running', null],
      Planned: ['planned', null],
    });
    expect((await productOf(product._id)).status).toBe('testing');
  });

  it('stops the product experiments when a decision kills or pauses the product', async () => {
    const [doomed, resting] = await Promise.all([createProduct({ status: 'testing' }), createProduct({ status: 'testing' })]);
    for (const product of [doomed, resting]) {
      await createExperiment(product._id, { name: 'Live', status: 'running', startDate: '2026-09-01' });
      await createExperiment(product._id, { name: 'Next', startDate: '2026-09-18' });
      await createExperiment(product._id, { name: 'Done', status: 'completed', startDate: '2026-09-01', endDate: '2026-09-05' });
    }
    await decide({ productId: doomed._id, decision: 'kill', date: '2026-09-20' });
    await decide({ productId: resting._id, decision: 'pause', date: '2026-09-20' });
    expect(await statuses(doomed._id)).toEqual({
      Live: ['stopped', '2026-09-20'],
      Next: ['stopped', '2026-09-20'],
      Done: ['completed', '2026-09-05'],
    });
    expect(await statuses(resting._id)).toEqual({
      Live: ['stopped', '2026-09-20'],
      Next: ['planned', null],
      Done: ['completed', '2026-09-05'],
    });
  });
});

describe('validation', () => {
  it('rejects unknown products and experiments from another product', async () => {
    const missing = await decide({ productId: MISSING_ID, decision: 'scale' });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: { message: 'Product not found', fields: { productId: 'Product not found' } } });

    const other = await createProduct();
    const res = await decide({ productId: other._id, experimentId: hooks._id, decision: 'scale' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ experimentId: 'Experiment not found for this product' });
    expect((await productOf(other._id)).status).toBe('ready_to_test');
  });

  it('rejects dates after today in the configured time zone', async () => {
    const product = await createProduct({ status: 'testing' });
    const future = { error: { message: 'Date cannot be in the future', fields: { date: 'Date cannot be in the future' } } };
    const res = await decide({ productId: product._id, decision: 'kill', date: '2026-09-30' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(future);
    expect((await productOf(product._id)).status).toBe('testing');
    expect((await api.get(`/decisions?productId=${product._id}`)).body.items).toEqual([]);

    setNow('2026-09-29T19:00:00.000Z');
    try {
      expect((await decide({ productId: product._id, decision: 'continue', date: '2026-09-30' })).status).toBe(201);
    } finally {
      setNow(NOW);
    }
    const [saved] = (await api.get(`/decisions?productId=${product._id}`)).body.items;
    const moved = await api.patch(`/decisions/${saved._id}`, { date: '2026-10-01' });
    expect(moved.status).toBe(400);
    expect(moved.body).toEqual(future);
  });

  it('requires a decision, reason and date', async () => {
    const res = await api.post('/decisions', { productId: planner._id, decision: 'stop', reason: ' ', date: '10/09/2026' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        message: 'Please fix the highlighted fields',
        fields: { decision: 'Choose a valid option', reason: 'Reason is required', date: 'Use a YYYY-MM-DD date' },
      },
    });
  });
});

describe('list, update and delete', () => {
  let product;
  let x;

  beforeAll(async () => {
    product = await createProduct({ name: 'Listed', status: 'testing' });
    x = await createExperiment(product._id, { name: 'Listed test' });
    await decide({ productId: product._id, decision: 'continue', date: '2026-09-01', applyStatus: false });
    await decide({ productId: product._id, experimentId: x._id, decision: 'iterate', date: '2026-09-05' });
    await decide({ productId: product._id, decision: 'scale', date: '2026-09-03', applyStatus: false });
  });

  it('lists decisions newest first with names', async () => {
    const res = await api.get(`/decisions?productId=${product._id}`);
    expect(res.body.items.map((d) => [d.date, d.decision, d.productName, d.experimentName])).toEqual([
      ['2026-09-05', 'iterate', 'Listed', 'Listed test'],
      ['2026-09-03', 'scale', 'Listed', ''],
      ['2026-09-01', 'continue', 'Listed', ''],
    ]);
    expect((await api.get(`/decisions?experimentId=${x._id}`)).body.items).toHaveLength(1);
    expect((await api.get(`/decisions?productId=${product._id}&limit=1`)).body.items).toHaveLength(1);
  });

  it('updates the reason, notes and date only', async () => {
    const [latest] = (await api.get(`/decisions?productId=${product._id}`)).body.items;
    const body = { reason: 'Hook fatigue', notes: 'Rotate hooks', date: '2026-09-06', decision: 'kill' };
    const res = await api.patch(`/decisions/${latest._id}`, body);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ reason: 'Hook fatigue', notes: 'Rotate hooks', date: '2026-09-06', decision: 'iterate' });
    expect((await api.patch(`/decisions/${latest._id}`, { reason: '' })).body.error.fields).toEqual({ reason: 'Reason is required' });
    expect((await api.patch(`/decisions/${MISSING_ID}`, { reason: 'x' })).status).toBe(404);
  });

  it('deletes decisions', async () => {
    const [latest] = (await api.get(`/decisions?productId=${product._id}`)).body.items;
    expect((await api.delete(`/decisions/${latest._id}`)).status).toBe(204);
    const again = await api.delete(`/decisions/${latest._id}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { message: 'Decision not found' } });
    expect((await api.get(`/decisions?productId=${product._id}`)).body.items).toHaveLength(2);
  });
});
