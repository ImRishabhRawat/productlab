import { beforeAll, describe, expect, it } from 'vitest';
import { MISSING_ID, NOW, api, create, resetDb, setupApi } from './setup.js';

setupApi();

const names = (res) => res.body.items.map((i) => i.name);
const transitions = (idea) => idea.history.map(({ from, to }) => [from, to]);
const EMPTY_SIGNAL = { score: null, note: '' };

describe('create and read', () => {
  it('creates an idea with scores and a first history entry', async () => {
    const res = await api.post('/ideas', {
      name: ' Budget planner ',
      category: 'Templates',
      expectedPrice: 499,
      effort: 3,
      demonstrability: 8,
      repeatPotential: 6,
      legalRisk: 2,
      validation: { signals: { demand: { score: 8 }, marketplace: { score: 7 }, social: { score: 6 }, search: { score: 5 } } },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Budget planner',
      status: 'idea',
      productId: null,
      convertedAt: null,
      scores: {
        demand: 6.5,
        ease: 7,
        demonstrability: 8,
        repeat: 6,
        risk: 2,
        potential: 71,
        potentialLevel: 'high',
        difficultyLevel: 'low',
        riskLevel: 'low',
      },
    });
    expect(res.body.history).toEqual([{ at: NOW, to: 'idea' }]);

    const got = await api.get(`/ideas/${res.body._id}`);
    expect(got.status).toBe(200);
    expect(got.body).toMatchObject({ name: 'Budget planner', product: null, scores: { potential: 71 } });
  });

  it('starts the history at the given status', async () => {
    const idea = await create('/ideas', { name: 'Course', status: 'researching' });
    expect(transitions(idea)).toEqual([[undefined, 'researching']]);
  });

  it('rejects invalid ideas with field messages', async () => {
    const res = await api.post('/ideas', { name: '', effort: 20, status: 'converted' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        message: 'Please fix the highlighted fields',
        fields: { name: 'Name is required', effort: 'Must be at most 10', status: 'Choose a valid option' },
      },
    });
  });

  it('returns 404 for unknown ideas', async () => {
    expect((await api.get(`/ideas/${MISSING_ID}`)).body).toEqual({ error: { message: 'Idea not found' } });
    expect((await api.patch(`/ideas/${MISSING_ID}`, { notes: 'x' })).status).toBe(404);
    expect((await api.delete(`/ideas/${MISSING_ID}`)).status).toBe(404);
    expect((await api.post(`/ideas/${MISSING_ID}/convert`, {})).status).toBe(404);
  });
});

describe('list', () => {
  beforeAll(async () => {
    await resetDb();
    await create('/ideas', {
      name: 'Budget planner',
      category: 'Templates',
      effort: 2,
      demonstrability: 9,
      repeatPotential: 8,
      legalRisk: 1,
      validation: { signals: { demand: { score: 9 }, search: { score: 8 } } },
    });
    await create('/ideas', {
      name: 'Legal course',
      category: 'Courses',
      status: 'researching',
      effort: 8,
      demonstrability: 3,
      repeatPotential: 2,
      legalRisk: 8,
      validation: { signals: { demand: { score: 3 } } },
    });
    await create('/ideas', {
      name: 'Meal prep kit',
      category: 'Templates',
      status: 'ready_to_test',
      targetCustomer: 'Busy parents',
      effort: 5,
      demonstrability: 6,
      repeatPotential: 5,
      legalRisk: 5,
    });
    await create('/ideas', { name: 'Blank idea' });
  });

  it('filters by status, category and search text', async () => {
    expect(names(await api.get('/ideas?status=researching'))).toEqual(['Legal course']);
    expect(names(await api.get('/ideas?category=Templates')).sort()).toEqual(['Budget planner', 'Meal prep kit']);
    expect(names(await api.get('/ideas?q=PARENTS'))).toEqual(['Meal prep kit']);
    expect(names(await api.get('/ideas?q=(plan'))).toEqual([]);
  });

  it('filters by potential, difficulty and risk level', async () => {
    const filtered = async (query) => names(await api.get(`/ideas?${query}`));
    expect(await filtered('potential=high')).toEqual(['Budget planner']);
    expect(await filtered('potential=medium')).toEqual(['Meal prep kit']);
    expect(await filtered('potential=low')).toEqual(['Legal course']);
    expect(await filtered('difficulty=low')).toEqual(['Budget planner']);
    expect(await filtered('difficulty=high')).toEqual(['Legal course']);
    expect(await filtered('risk=medium')).toEqual(['Meal prep kit']);
    expect(await filtered('risk=high&category=Courses')).toEqual(['Legal course']);
    expect(await filtered('risk=high&category=Templates')).toEqual([]);
  });

  it('sorts by potential and name', async () => {
    expect(names(await api.get('/ideas?sort=-potential'))).toEqual(['Budget planner', 'Meal prep kit', 'Legal course', 'Blank idea']);
    expect(names(await api.get('/ideas?sort=potential'))).toEqual(['Blank idea', 'Legal course', 'Meal prep kit', 'Budget planner']);
    expect(names(await api.get('/ideas?sort=name'))).toEqual(['Blank idea', 'Budget planner', 'Legal course', 'Meal prep kit']);
  });

  it('returns category facets and scores without the history', async () => {
    const res = await api.get('/ideas');
    expect(res.body.facets).toEqual({ categories: ['Courses', 'Templates'] });
    expect(res.body.items).toHaveLength(4);
    expect(res.body.items.every((i) => i.history === undefined)).toBe(true);
    expect(res.body.items.find((i) => i.name === 'Meal prep kit').scores).toMatchObject({
      demand: null,
      potential: 53,
      potentialLevel: 'medium',
      difficultyLevel: 'medium',
      riskLevel: 'medium',
    });
  });

  it('rejects unknown filter values', async () => {
    const res = await api.get('/ideas?potential=extreme');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Invalid filters', fields: { potential: 'Choose a valid option' } } });
  });
});

describe('update', () => {
  it('records status changes only when the status moves', async () => {
    const idea = await create('/ideas', { name: 'Tracker' });
    await api.patch(`/ideas/${idea._id}`, { status: 'researching' });
    const res = await api.patch(`/ideas/${idea._id}`, { status: 'researching', notes: 'Checked forums' });
    expect(res.status).toBe(200);
    expect(res.body.notes).toBe('Checked forums');
    expect(transitions(res.body)).toEqual([
      [undefined, 'idea'],
      ['idea', 'researching'],
    ]);
  });

  it('replaces provided validation keys and merges signals per key', async () => {
    const idea = await create('/ideas', {
      name: 'Planner',
      validation: {
        competitors: [{ name: 'Etsy shop', price: 399 }],
        audience: 'Parents',
        signals: { demand: { score: 6, note: 'Forum posts' }, search: { score: 4 } },
      },
    });
    const res = await api.patch(`/ideas/${idea._id}`, {
      validation: {
        competitors: [{ name: 'Gumroad', url: 'https://gumroad.com/p' }],
        painDesire: 'Saves time',
        signals: { demand: { score: 8 } },
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.validation).toEqual({
      competitors: [{ name: 'Gumroad', url: 'https://gumroad.com/p', price: null, notes: '' }],
      ads: [],
      priceExamples: [],
      audience: 'Parents',
      painDesire: 'Saves time',
      rightsNotes: '',
      signals: {
        demand: { score: 8, note: 'Forum posts' },
        marketplace: EMPTY_SIGNAL,
        social: EMPTY_SIGNAL,
        search: { score: 4, note: '' },
      },
    });
    expect(res.body.scores.demand).toBe(6);

    const signals = { social: { note: 'Reels trend' }, search: { score: null } };
    const next = await api.patch(`/ideas/${idea._id}`, { validation: { signals } });
    expect(next.body.validation.signals).toEqual({
      demand: { score: 8, note: 'Forum posts' },
      marketplace: EMPTY_SIGNAL,
      social: { score: null, note: 'Reels trend' },
      search: EMPTY_SIGNAL,
    });
    expect(next.body.validation).toMatchObject({ audience: 'Parents', painDesire: 'Saves time', competitors: [{ name: 'Gumroad' }] });
    expect(next.body.scores.demand).toBe(8);
  });

  it('deletes ideas that were not converted', async () => {
    const idea = await create('/ideas', { name: 'Throwaway' });
    expect((await api.delete(`/ideas/${idea._id}`)).status).toBe(204);
    expect((await api.get(`/ideas/${idea._id}`)).status).toBe(404);
  });
});

describe('convert', () => {
  let idea;
  let converted;

  beforeAll(async () => {
    await api.patch('/settings', {
      defaultPaymentFeePct: 3,
      defaultRefundRatePct: 4,
      defaultVariableCostPerSale: 12,
      defaultDesiredMarginPct: 25,
    });
    idea = await create('/ideas', {
      name: 'Habit tracker',
      category: 'Templates',
      problem: 'People forget habits',
      format: 'Notion template',
      deliverable: 'Template and guide',
      targetCustomer: 'Students',
      expectedPrice: 299,
    });
    await api.patch(`/ideas/${idea._id}`, { status: 'researching' });
    converted = await api.post(`/ideas/${idea._id}/convert`, {});
  });

  it('creates a product with the idea details and cost defaults from settings', () => {
    expect(converted.status).toBe(201);
    expect(converted.body.product).toMatchObject({
      name: 'Habit tracker',
      category: 'Templates',
      description: 'People forget habits',
      format: 'Notion template',
      deliverable: 'Template and guide',
      targetCustomer: 'Students',
      price: 299,
      status: 'ready_to_test',
      version: 'v1',
      ideaId: idea._id,
      costs: { paymentFeePct: 3, refundRatePct: 4, variableCostPerSale: 12 },
      desiredMarginPct: 25,
      killedAt: null,
    });
    expect(converted.body.product.events).toBeUndefined();
  });

  it('marks the idea converted and links both ways', async () => {
    const { product, idea: updated } = converted.body;
    expect(updated).toMatchObject({ status: 'converted', productId: product._id, convertedAt: NOW });
    expect(transitions(updated)).toEqual([
      [undefined, 'idea'],
      ['idea', 'researching'],
      ['researching', 'converted'],
    ]);
    const linkedProduct = (await api.get(`/ideas/${idea._id}`)).body.product;
    expect(linkedProduct).toEqual({ _id: product._id, name: 'Habit tracker', status: 'ready_to_test', price: 299 });
    const linkedIdea = (await api.get(`/products/${product._id}`)).body.idea;
    expect(linkedIdea).toMatchObject({ _id: idea._id, name: 'Habit tracker', status: 'converted' });
  });

  it('refuses to convert, delete or change the status of a converted idea', async () => {
    const again = await api.post(`/ideas/${idea._id}/convert`, {});
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: { message: 'This idea is already a product' } });
    expect((await api.delete(`/ideas/${idea._id}`)).status).toBe(409);
    expect((await api.patch(`/ideas/${idea._id}`, { status: 'idea' })).status).toBe(409);
    const notes = await api.patch(`/ideas/${idea._id}`, { notes: 'Launched' });
    expect(notes.status).toBe(200);
    expect(notes.body).toMatchObject({ status: 'converted', notes: 'Launched' });
    expect((await api.get('/products')).body.items).toHaveLength(1);
  });

  it('accepts a starting status and price', async () => {
    const other = await create('/ideas', { name: 'Recipe cards', expectedPrice: 199 });
    const res = await api.post(`/ideas/${other._id}/convert`, { status: 'testing', price: 249 });
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ status: 'testing', price: 249 });
  });

  it('defaults the price to 0 without an expected price', async () => {
    const other = await create('/ideas', { name: 'No price yet' });
    expect((await api.post(`/ideas/${other._id}/convert`, {})).body.product.price).toBe(0);
  });

  it('validates the conversion body', async () => {
    const other = await create('/ideas', { name: 'Bad convert' });
    const res = await api.post(`/ideas/${other._id}/convert`, { status: 'scaling' });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ status: 'Choose a valid option' });
    expect((await api.get(`/ideas/${other._id}`)).body.status).toBe('idea');
  });
});
