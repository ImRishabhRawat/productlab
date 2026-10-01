import { beforeAll, describe, expect, it } from 'vitest';
import { MISSING_ID, api, create, createExperiment, createProduct, setupApi } from './setup.js';

setupApi();

const main = (amount) => [{ kind: 'main', amount }];
const orderFor = (product, email, body) => ({ productId: product._id, customer: { email }, items: main(500), date: '2026-09-01', ...body });
const refundError = (message) => ({ error: { message, fields: { refundAmount: message } } });
const stats = ({ totalSpent, orderCount, firstPurchaseAt, lastPurchaseAt, productIds }) => ({
  totalSpent,
  orderCount,
  firstPurchaseAt,
  lastPurchaseAt,
  productIds: [...productIds].sort(),
});

async function customerByEmail(email) {
  const res = await api.get(`/customers?q=${encodeURIComponent(email)}`);
  return res.body.items.find((c) => c.email === email);
}

let planner;
let course;
let plannerTest;
let courseTest;

beforeAll(async () => {
  planner = await createProduct({ name: 'Planner', price: 500 });
  course = await createProduct({ name: 'Course', price: 1000 });
  plannerTest = await createExperiment(planner._id, { name: 'Planner launch' });
  courseTest = await createExperiment(course._id, { name: 'Course launch' });
});

describe('create', () => {
  it('creates the customer from the email and reuses it case-insensitively', async () => {
    const first = await api.post('/orders', orderFor(planner, 'Asha@Example.com'));
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({
      productId: planner._id,
      experimentId: null,
      amount: 500,
      paymentStatus: 'paid',
      refundStatus: 'none',
      refundAmount: 0,
      date: '2026-08-31T18:30:00.000Z',
    });

    const second = await create('/orders', {
      productId: course._id,
      experimentId: courseTest._id,
      customer: { email: ' ASHA@example.COM ', name: 'Asha' },
      items: [
        { kind: 'main', amount: 999.99 },
        { kind: 'bump', name: 'Checklist', amount: 99.5 },
      ],
      date: '2026-09-03T10:00:00+05:30',
      campaign: 'course-launch',
    });
    expect(second).toMatchObject({
      customerId: first.body.customerId,
      experimentId: courseTest._id,
      amount: 1099.49,
      date: '2026-09-03T04:30:00.000Z',
    });

    await create('/orders', {
      ...orderFor(planner, 'asha@example.com', { date: '2026-09-02', paymentStatus: 'failed' }),
      customer: { email: 'asha@example.com', name: 'Someone else' },
    });

    const asha = await customerByEmail('asha@example.com');
    expect(asha._id).toBe(first.body.customerId);
    expect(asha.name).toBe('Asha');
    expect(stats(asha)).toEqual({
      totalSpent: 1599.49,
      orderCount: 2,
      firstPurchaseAt: '2026-08-31T18:30:00.000Z',
      lastPurchaseAt: '2026-09-03T04:30:00.000Z',
      productIds: [planner._id, course._id].sort(),
    });
    expect((await api.get('/customers?q=asha')).body.total).toBe(1);
  });

  it('uses an existing customer by id', async () => {
    const bala = await create('/customers', { email: 'bala@example.com', name: 'Bala' });
    const order = await create('/orders', { productId: planner._id, customerId: bala._id, items: main(500), date: '2026-09-04' });
    expect(order.customerId).toBe(bala._id);
    expect((await customerByEmail('bala@example.com')).orderCount).toBe(1);
  });

  const newCustomer = { customer: { email: 'x@example.com' } };

  it.each([
    ['an unknown customer id', () => ({ customerId: MISSING_ID }), 'Customer not found', { customerId: 'Customer not found' }],
    ['a missing customer', () => ({}), 'Enter a customer email', { 'customer.email': 'Enter a customer email' }],
    ['an unknown product', () => ({ ...newCustomer, productId: MISSING_ID }), 'Product not found', { productId: 'Product not found' }],
    [
      "another product's experiment",
      () => ({ ...newCustomer, experimentId: courseTest._id }),
      'Experiment not found for this product',
      { experimentId: 'Experiment not found for this product' },
    ],
    [
      'a partial refund without an amount',
      () => ({ ...newCustomer, refundStatus: 'partial' }),
      'Enter the refunded amount',
      { refundAmount: 'Enter the refunded amount' },
    ],
    [
      'a refund above the order amount',
      () => ({ ...newCustomer, refundStatus: 'partial', refundAmount: 600 }),
      'Refund exceeds the order amount',
      { refundAmount: 'Refund exceeds the order amount' },
    ],
  ])('rejects %s without creating a customer', async (_, body, message, fields) => {
    const res = await api.post('/orders', { productId: planner._id, items: main(500), date: '2026-09-01', ...body() });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message, fields } });
    expect(await customerByEmail('x@example.com')).toBeUndefined();
  });

  it('validates the customer and items', async () => {
    const empty = await api.post('/orders', orderFor(planner, 'y@example.com', { items: [] }));
    expect(empty.body.error.fields).toEqual({ items: 'Add at least one item' });
    const bad = await api.post('/orders', orderFor(planner, 'nope', { items: [{ kind: 'gift', amount: -1 }] }));
    expect(bad.body.error.fields).toEqual({
      'customer.email': 'Invalid email',
      'items.0.kind': 'Choose a valid option',
      'items.0.amount': 'Must be at least 0',
    });
  });
});

describe('refunds', () => {
  const order = (body) => api.post('/orders', orderFor(planner, 'refunds@example.com', { date: '2026-09-05', items: main(650), ...body }));

  it('zeroes the refund amount when there is no refund', async () => {
    expect((await order({ refundStatus: 'none', refundAmount: 50 })).body).toMatchObject({ refundStatus: 'none', refundAmount: 0 });
    expect((await order({ refundAmount: 50 })).body).toMatchObject({ refundStatus: 'none', refundAmount: 0 });
  });

  it('refunds the full amount for full refunds', async () => {
    const res = await order({ items: [...main(500), { kind: 'upsell', amount: 150 }], refundStatus: 'full' });
    expect(res.body).toMatchObject({ amount: 650, refundStatus: 'full', refundAmount: 650 });
  });

  it('requires a positive amount for partial refunds within the order amount', async () => {
    const missing = await order({ refundStatus: 'partial' });
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual(refundError('Enter the refunded amount'));
    const tooMuch = await order({ refundStatus: 'partial', refundAmount: 700 });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body).toEqual(refundError('Refund exceeds the order amount'));
    expect((await order({ refundStatus: 'partial', refundAmount: 150 })).body).toMatchObject({ refundAmount: 150 });
  });
});

describe('customer stats', () => {
  let chen;
  let first;
  let second;

  beforeAll(async () => {
    first = await create('/orders', orderFor(planner, 'chen@example.com', { date: '2026-09-05' }));
    second = await create('/orders', orderFor(course, 'chen@example.com', { items: main(1000), date: '2026-09-10' }));
    chen = first.customerId;
  });

  const chenStats = async () => stats(await customerByEmail('chen@example.com'));

  it('totals paid orders on create', async () => {
    expect(await chenStats()).toEqual({
      totalSpent: 1500,
      orderCount: 2,
      firstPurchaseAt: '2026-09-04T18:30:00.000Z',
      lastPurchaseAt: '2026-09-09T18:30:00.000Z',
      productIds: [planner._id, course._id].sort(),
    });
  });

  it('nets refunds and drops unpaid orders on update', async () => {
    await api.patch(`/orders/${first._id}`, { refundStatus: 'partial', refundAmount: 200 });
    expect((await chenStats()).totalSpent).toBe(1300);

    const full = await api.patch(`/orders/${second._id}`, { refundStatus: 'full' });
    expect(full.body).toMatchObject({ refundStatus: 'full', refundAmount: 1000 });
    expect(await chenStats()).toMatchObject({ totalSpent: 300, orderCount: 2 });

    await api.patch(`/orders/${second._id}`, { paymentStatus: 'failed' });
    expect(await chenStats()).toEqual({
      totalSpent: 300,
      orderCount: 1,
      firstPurchaseAt: '2026-09-04T18:30:00.000Z',
      lastPurchaseAt: '2026-09-04T18:30:00.000Z',
      productIds: [planner._id],
    });

    const bigger = await api.patch(`/orders/${first._id}`, { items: main(800), date: '2026-09-06' });
    expect(bigger.body).toMatchObject({ amount: 800, refundAmount: 200, date: '2026-09-05T18:30:00.000Z' });
    expect(await chenStats()).toMatchObject({ totalSpent: 600, lastPurchaseAt: '2026-09-05T18:30:00.000Z' });

    const tooSmall = await api.patch(`/orders/${first._id}`, { items: main(100) });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body).toEqual(refundError('Refund exceeds the order amount'));
    expect((await api.get(`/orders/${first._id}`)).body.amount).toBe(800);
  });

  it('moves orders between customers and recalculates both', async () => {
    const moved = await api.patch(`/orders/${first._id}`, { customer: { email: 'dev@example.com', name: 'Dev' } });
    expect(moved.status).toBe(200);
    expect(moved.body.customerId).not.toBe(chen);
    expect(await chenStats()).toEqual({ totalSpent: 0, orderCount: 0, firstPurchaseAt: null, lastPurchaseAt: null, productIds: [] });
    expect(await customerByEmail('dev@example.com')).toMatchObject({ name: 'Dev', totalSpent: 600, orderCount: 1 });
  });

  it('recalculates on delete', async () => {
    expect((await api.delete(`/orders/${first._id}`)).status).toBe(204);
    expect(await customerByEmail('dev@example.com')).toMatchObject({ totalSpent: 0, orderCount: 0, lastPurchaseAt: null, productIds: [] });
    const again = await api.delete(`/orders/${first._id}`);
    expect(again.status).toBe(404);
    expect(again.body).toEqual({ error: { message: 'Order not found' } });
  });

  it('moves an order to another product while clearing its experiment', async () => {
    const order = await create('/orders', orderFor(planner, 'mover@example.com', { experimentId: plannerTest._id, date: '2026-09-07' }));
    const res = await api.patch(`/orders/${order._id}`, { productId: course._id, experimentId: null });
    expect(res.body).toMatchObject({ productId: course._id, experimentId: null });
    expect(res.status).toBe(200);
    expect((await customerByEmail('mover@example.com')).productIds).toEqual([course._id]);
  });

  it('rejects an experiment from another product on update', async () => {
    const order = await create('/orders', orderFor(planner, 'mover2@example.com', { date: '2026-09-07' }));
    const res = await api.patch(`/orders/${order._id}`, { experimentId: courseTest._id });
    expect(res.status).toBe(400);
    expect(res.body.error.fields).toEqual({ experimentId: 'Experiment not found for this product' });
  });

  it('rejects an invalid refund on update without creating the new customer', async () => {
    const order = await create('/orders', orderFor(planner, 'keeper@example.com', { date: '2026-09-07' }));
    for (const refund of [{ refundStatus: 'partial' }, { refundStatus: 'partial', refundAmount: 900 }]) {
      const res = await api.patch(`/orders/${order._id}`, { customer: { email: 'typo@example.com' }, ...refund });
      expect(res.status).toBe(400);
    }
    expect(await customerByEmail('typo@example.com')).toBeUndefined();
    expect((await api.get(`/orders/${order._id}`)).body.customerId).toBe(order.customerId);
  });
});

describe('list and read', () => {
  it('lists orders with customer, product and experiment names', async () => {
    const res = await api.get('/orders?q=asha&sort=date');
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((o) => [o.customer.email, o.productName, o.experimentName, o.paymentStatus])).toEqual([
      ['asha@example.com', 'Planner', '', 'paid'],
      ['asha@example.com', 'Planner', '', 'failed'],
      ['asha@example.com', 'Course', 'Course launch', 'paid'],
    ]);
    expect(res.body.items[0].customer).toEqual({ _id: expect.any(String), name: 'Asha', email: 'asha@example.com' });
  });

  it('filters by kind, status, experiment, campaign and local calendar days', async () => {
    const count = async (query) => (await api.get(`/orders?${query}`)).body.total;
    expect(await count('kind=bump')).toBe(1);
    expect(await count('kind=upsell&refundStatus=full')).toBe(1);
    expect(await count('paymentStatus=failed')).toBe(2);
    expect(await count(`experimentId=${courseTest._id}`)).toBe(1);
    expect(await count('campaign=course-launch')).toBe(1);
    expect(await count('from=2026-09-03&to=2026-09-03')).toBe(1);
    expect(await count(`from=2026-09-01&to=2026-09-01&productId=${planner._id}`)).toBe(1);
    expect(await count('limit=2')).toBeGreaterThan(2);
    expect((await api.get('/orders?limit=2')).body.items).toHaveLength(2);
  });

  it('reads one order and 404s for unknown ids', async () => {
    const [any] = (await api.get('/orders?q=bala')).body.items;
    const res = await api.get(`/orders/${any._id}`);
    expect(res.body).toMatchObject({ _id: any._id, productName: 'Planner', customer: { name: 'Bala', email: 'bala@example.com' } });
    expect((await api.get(`/orders/${MISSING_ID}`)).body).toEqual({ error: { message: 'Order not found' } });
    expect((await api.patch(`/orders/${MISSING_ID}`, { notes: 'x' })).status).toBe(404);
  });
});

describe('customers', () => {
  it('returns a customer with products and orders', async () => {
    const asha = await customerByEmail('asha@example.com');
    const res = await api.get(`/customers/${asha._id}`);
    expect(res.body.products.map((p) => p.name).sort()).toEqual(['Course', 'Planner']);
    expect(res.body.orders.map((o) => [o.productName, o.amount])).toEqual([
      ['Course', 1099.49],
      ['Planner', 500],
      ['Planner', 500],
    ]);
  });

  it('keeps customers with orders and deletes others', async () => {
    const asha = await customerByEmail('asha@example.com');
    const res = await api.delete(`/customers/${asha._id}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { message: 'Customers with orders are kept for history.' } });
    const lead = await create('/customers', { email: 'lead@example.com' });
    expect((await api.delete(`/customers/${lead._id}`)).status).toBe(204);
    expect((await api.get(`/customers/${lead._id}`)).status).toBe(404);
  });

  it('rejects duplicate emails', async () => {
    const res = await api.post('/customers', { email: 'ASHA@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { message: 'email already exists', fields: { email: 'Already exists' } } });
  });

  it('updates contact details and rejects an email that is taken', async () => {
    const lead = await create('/customers', { email: 'Nina@Example.com', name: 'Nina' });
    expect(lead.email).toBe('nina@example.com');
    const res = await api.patch(`/customers/${lead._id}`, { name: 'Nina K', phone: '+91 98765 43210', email: ' NINA.K@example.com ' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Nina K', phone: '+91 98765 43210', email: 'nina.k@example.com', totalSpent: 0 });
    const taken = await api.patch(`/customers/${lead._id}`, { email: 'asha@example.com' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.fields).toEqual({ email: 'Already exists' });
  });

  it('filters customers by product', async () => {
    const toolkit = await createProduct({ name: 'Toolkit' });
    await create('/orders', orderFor(toolkit, 'kit@example.com', { date: '2026-09-08' }));
    const res = await api.get(`/customers?productId=${toolkit._id}`);
    expect(res.body.total).toBe(1);
    expect(res.body.items.map((c) => [c.email, c.products])).toEqual([['kit@example.com', [{ _id: toolkit._id, name: 'Toolkit' }]]]);
  });

  it('sorts customers by total spent', async () => {
    const res = await api.get('/customers?sort=-totalSpent&limit=2');
    expect(res.body.items.map((c) => [c.email, c.totalSpent])).toEqual([
      ['refunds@example.com', 1800],
      ['asha@example.com', 1599.49],
    ]);
    expect(res.body.items[1].products.map((p) => p.name).sort()).toEqual(['Course', 'Planner']);
  });
});
