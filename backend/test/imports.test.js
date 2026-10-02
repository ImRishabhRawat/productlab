import webpush from 'web-push';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { METRIC_FIELDS } from '@product-lab/shared/constants';
import { config } from '../src/config.js';
import CampaignMetric from '../src/models/CampaignMetric.js';
import Customer from '../src/models/Customer.js';
import Notification from '../src/models/Notification.js';
import Order from '../src/models/Order.js';
import PushSubscription from '../src/models/PushSubscription.js';
import { ADMIN, MISSING_ID, anon, api, create, createExperiment, createProduct, setupApi } from './setup.js';

vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

setupApi();

const FIX = 'Please fix the highlighted fields';
const MAIN = { kind: 'main', name: 'Silent Satsang', amount: 399 };
const BUNDLE = { kind: 'bundle', name: '100+ ready to post Rajneesh Reels', amount: 99 };

const order = (externalId, body) => ({
  externalId,
  date: '2026-09-01T10:00:00.000Z',
  email: `${externalId.toLowerCase()}@example.com`,
  items: [MAIN],
  paymentStatus: 'paid',
  ...body,
});
const day = (date, body) => ({
  date,
  campaign: 'Sales',
  adSet: 'Broad',
  spend: 100,
  impressions: 1000,
  reach: 800,
  clicks: 20,
  landingPageViews: 15,
  checkouts: 3,
  purchases: 1,
  revenue: 399,
  ...body,
});
const many = (count, make) => Array.from({ length: count }, (_, i) => make(i));
const orderResult = (body) => ({ created: 0, updated: 0, unchanged: 0, customersCreated: 0, failed: [], ...body });
const metricResult = (body) => ({ created: 0, updated: 0, unchanged: 0, failed: [], ...body });
const failure = (row, externalId, message, fields = { externalId: message }) => ({ row, externalId, message, fields });
const customer = (email) => Customer.findOne({ email }).lean();
const byExternalId = (externalId) => Order.findOne({ externalId }).lean();
const alerts = async (type) => (await Notification.find({ type }).sort({ createdAt: 1, _id: 1 }).lean()).map((n) => n.title);
const prefs = (business) => api.patch('/notification-preferences', { business });

let satsang;
let other;

beforeAll(async () => {
  await Promise.all([Order.init(), Notification.init()]);
  satsang = await createProduct({ name: 'Silent Satsang', price: 399 });
  other = await createProduct({ name: 'Other product' });
});

const importOrders = (rows, body) => api.post('/orders/import', { productId: satsang._id, rows, ...body });

describe('order import', () => {
  const first = [
    order('SS-1', {
      email: ' Asha@Example.com ',
      name: 'Asha',
      phone: '98765 43210',
      items: [MAIN, BUNDLE],
      campaign: 'launch',
      notes: 'From console',
    }),
    order('SS-2', { email: 'asha@example.com', date: '2026-09-02', paymentStatus: 'pending' }),
    order('SS-3', { date: '2026-09-03T08:00:00.000Z' }),
  ];

  it('creates orders and finds or creates their customers by email', async () => {
    const res = await importOrders(first);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(orderResult({ created: 3, customersCreated: 2 }));
    const items = (await api.get(`/orders?productId=${satsang._id}&sort=date`)).body.items;
    expect(items.map((o) => [o.externalId, o.customer.email, o.amount, o.paymentStatus, o.date])).toEqual([
      ['SS-1', 'asha@example.com', 498, 'paid', '2026-09-01T10:00:00.000Z'],
      ['SS-2', 'asha@example.com', 399, 'pending', '2026-09-01T18:30:00.000Z'],
      ['SS-3', 'ss-3@example.com', 399, 'paid', '2026-09-03T08:00:00.000Z'],
    ]);
    expect(items[0]).toMatchObject({
      items: [MAIN, BUNDLE],
      campaign: 'launch',
      notes: 'From console',
      experimentId: null,
      refundStatus: 'none',
      refundAmount: 0,
    });
    expect(await customer('asha@example.com')).toMatchObject({ name: 'Asha', phone: '98765 43210', totalSpent: 498, orderCount: 1 });
    expect((await customer('ss-3@example.com')).productIds.map(String)).toEqual([satsang._id]);
  });

  it('reports a re-import of the same orders as unchanged', async () => {
    const again = [{ ...first[0], date: '2026-09-01T15:30:00+05:30', notes: 'Edited in the console' }, first[1], first[2]];
    expect((await importOrders(again)).body).toEqual(orderResult({ unchanged: 3 }));
    expect((await byExternalId('SS-1')).notes).toBe('From console');
  });

  it('updates changed orders and recalculates their customers', async () => {
    const paid = order('SS-2', { email: 'asha@example.com', date: '2026-09-04T09:00:00.000Z' });
    expect((await importOrders([paid, { ...first[2], items: [MAIN, BUNDLE] }])).body).toEqual(orderResult({ updated: 2 }));
    expect(await byExternalId('SS-2')).toMatchObject({ paymentStatus: 'paid', date: new Date('2026-09-04T09:00:00.000Z') });
    expect(await byExternalId('SS-3')).toMatchObject({ amount: 498 });
    expect(await customer('asha@example.com')).toMatchObject({
      totalSpent: 897,
      orderCount: 2,
      lastPurchaseAt: new Date('2026-09-04T09:00:00.000Z'),
    });
    expect((await customer('ss-3@example.com')).totalSpent).toBe(498);

    expect((await importOrders([{ ...first[0], refundStatus: 'full', campaign: 'launch-2' }])).body).toEqual(orderResult({ updated: 1 }));
    expect(await byExternalId('SS-1')).toMatchObject({ refundStatus: 'full', refundAmount: 498, campaign: 'launch-2' });
    expect((await customer('asha@example.com')).totalSpent).toBe(399);

    const { campaign: _, ...withoutCampaign } = first[0];
    expect((await importOrders([withoutCampaign])).body).toEqual(orderResult({ unchanged: 1 }));
    expect(await byExternalId('SS-1')).toMatchObject({ refundStatus: 'full', campaign: 'launch-2' });
  });

  it('keeps the first row of an order ID that repeats in the file', async () => {
    const res = await importOrders([order('DUP-1'), order('DUP-1', { items: [MAIN, BUNDLE] }), order('DUP-2')]);
    const duplicate = failure(1, 'DUP-1', 'Duplicate order ID in this file');
    expect(res.body).toEqual(orderResult({ created: 2, customersCreated: 2, failed: [duplicate] }));
    expect((await byExternalId('DUP-1')).amount).toBe(399);
  });

  it('reports invalid rows without blocking the others', async () => {
    const res = await importOrders([
      order('BAD-1', { email: 'nope' }),
      order('OK-1'),
      order('BAD-2', { date: '01/09/2026', items: [{ kind: 'gift', name: ' ', amount: -1 }] }),
      order('BAD-3', { refundStatus: 'partial' }),
      order(' ', { email: 'blank@example.com' }),
      'not a row',
    ]);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      orderResult({
        created: 1,
        customersCreated: 1,
        failed: [
          failure(0, 'BAD-1', 'email: Invalid email', { email: 'Invalid email' }),
          failure(2, 'BAD-2', expect.stringContaining('date: Use a YYYY-MM-DD date'), {
            date: 'Use a YYYY-MM-DD date',
            'items.0.kind': 'Choose a valid option',
            'items.0.name': 'Item name is required',
            'items.0.amount': 'Must be at least 0',
          }),
          failure(3, 'BAD-3', 'Enter the refunded amount', { refundAmount: 'Enter the refunded amount' }),
          failure(4, '', 'externalId: Order ID is required', { externalId: 'Order ID is required' }),
          failure(5, '', 'Invalid value', { _: 'Invalid value' }),
        ],
      }),
    );
    expect(await byExternalId('OK-1')).toMatchObject({ amount: 399 });
    expect(await customer('bad-3@example.com')).toBeNull();
    expect(await customer('blank@example.com')).toBeNull();
  });

  it('refuses an order ID that belongs to another product', async () => {
    const res = await api.post('/orders/import', { productId: other._id, rows: [order('SS-3'), order('OT-1')] });
    expect(res.body).toEqual(
      orderResult({ created: 1, customersCreated: 1, failed: [failure(0, 'SS-3', 'Order SS-3 belongs to another product')] }),
    );
    expect(await byExternalId('SS-3')).toMatchObject({ amount: 498 });
    expect(String((await byExternalId('SS-3')).productId)).toBe(satsang._id);
  });

  it('fills a missing customer name and phone without overwriting them', async () => {
    await create('/customers', { email: 'lead@example.com' });
    await create('/customers', { email: 'chen@example.com', name: 'Chen', phone: '11111' });
    const res = await importOrders([
      order('FILL-1', { email: 'lead@example.com', name: 'Lead', phone: '22222' }),
      order('FILL-2', { email: 'chen@example.com', name: 'Someone else', phone: '33333' }),
      order('FILL-3', { email: 'new@example.com' }),
      order('FILL-4', { email: 'new@example.com', name: 'Newbie', phone: '44444' }),
    ]);
    expect(res.body).toEqual(orderResult({ created: 4, customersCreated: 1 }));
    expect(await customer('lead@example.com')).toMatchObject({ name: 'Lead', phone: '22222', orderCount: 1 });
    expect(await customer('chen@example.com')).toMatchObject({ name: 'Chen', phone: '11111', orderCount: 1 });
    expect(await customer('new@example.com')).toMatchObject({ name: 'Newbie', phone: '44444', orderCount: 2 });
  });

  it('previews an import with the same counts without writing anything', async () => {
    await create('/customers', { email: 'quiet@example.com' });
    const rows = [
      order('PRE-1', { email: 'preview@example.com', name: 'Preview' }),
      order('PRE-2', { email: 'quiet@example.com', name: 'Quiet', phone: '55555' }),
      { ...first[2], items: [MAIN] },
      order('DUP-2'),
      order('PRE-1'),
      order('PRE-3', { email: 'bad' }),
    ];
    const state = async () => JSON.stringify([await Order.find().sort({ _id: 1 }).lean(), await Customer.find().sort({ _id: 1 }).lean()]);
    const before = await state();
    const preview = await importOrders(rows, { dryRun: true });
    expect(preview.body).toEqual(
      orderResult({
        created: 2,
        updated: 1,
        unchanged: 1,
        customersCreated: 1,
        failed: [
          failure(4, 'PRE-1', 'Duplicate order ID in this file'),
          failure(5, 'PRE-3', 'email: Invalid email', { email: 'Invalid email' }),
        ],
      }),
    );
    expect(await state()).toBe(before);
    expect((await importOrders(rows)).body).toEqual(preview.body);
    expect(await customer('quiet@example.com')).toMatchObject({ name: 'Quiet', phone: '55555', orderCount: 1 });
  });

  it.each([
    ['an unknown product', () => ({ productId: MISSING_ID }), 'Product not found', { productId: 'Product not found' }],
    ['a malformed product id', () => ({ productId: 'abc' }), FIX, { productId: 'Invalid id' }],
    ['rows that are not a list', () => ({ rows: order('ENV-1') }), FIX, { rows: 'Invalid value' }],
    ['an empty file', () => ({ rows: [] }), FIX, { rows: 'Add at least one row' }],
    ['more than 500 rows', () => ({ rows: many(501, (i) => order(`CAP-${i}`)) }), FIX, { rows: 'Import at most 500 rows at a time' }],
  ])('rejects %s', async (_, body, message, fields) => {
    const res = await api.post('/orders/import', { productId: satsang._id, rows: [order('ENV-1')], ...body() });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message, fields } });
    expect(await Order.countDocuments({ externalId: /^(ENV|CAP)-/ })).toBe(0);
  });

  it('accepts 500 rows in one request', async () => {
    const res = await importOrders(
      many(500, (i) => order(`CAP-${i}`)),
      { dryRun: true },
    );
    expect(res.body).toEqual(orderResult({ created: 500, customersCreated: 500 }));
  });

  it('keeps order IDs unique and leaves orders without one alone', async () => {
    const index = (await Order.collection.indexes()).find((i) => i.key.externalId);
    expect(index).toMatchObject({ unique: true, partialFilterExpression: { externalId: { $type: 'string' } } });
    const { _id, ...copy } = await byExternalId('SS-1');
    await expect(Order.create(copy)).rejects.toMatchObject({ code: 11000 });
    const manual = { productId: satsang._id, customer: { email: 'manual@example.com' }, items: [MAIN], date: '2026-09-05' };
    await create('/orders', manual);
    await create('/orders', manual);
    expect(await Order.countDocuments({ externalId: { $exists: false } })).toBe(2);
  });
});

describe('order import alerts', () => {
  const saved = { ...config.vapid };
  const pushed = () => webpush.sendNotification.mock.calls.map(([, body]) => JSON.parse(body).title);

  beforeAll(async () => {
    Object.assign(config.vapid, { publicKey: 'BTestPublicKey', privateKey: 'test-private-key', subject: 'mailto:admin@test.local' });
    const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' };
    await PushSubscription.create({ owner: ADMIN.email, endpoint: 'https://fcm.googleapis.com/fcm/send/phone', keys });
    await prefs({ newOrder: true, refund: true });
    webpush.sendNotification.mockReset();
  });
  afterAll(async () => {
    Object.assign(config.vapid, saved);
    await prefs({ newOrder: false, refund: false });
  });

  it('stays silent for orders older than a day and announces a fresh paid order', async () => {
    const rows = [
      order('AL-1', { date: '2026-09-27T10:00:00.000Z' }),
      order('AL-2', { date: '2026-09-20', refundStatus: 'full' }),
      order('AL-3', { date: '2026-09-29T05:00:00.000Z', items: [MAIN, BUNDLE] }),
      order('AL-4', { date: '2026-09-28T07:00:00.000Z', paymentStatus: 'pending' }),
    ];
    expect((await importOrders(rows)).body.created).toBe(4);
    expect([await alerts('new_order'), await alerts('refund')]).toEqual([['New order · ₹498'], []]);
    await vi.waitFor(() => expect(pushed()).toEqual(['New order · ₹498']));

    const paidLater = { ...rows[3], paymentStatus: 'paid' };
    const oldRefund = { ...rows[0], refundStatus: 'full' };
    expect((await importOrders([paidLater, oldRefund])).body.updated).toBe(2);
    expect([await alerts('new_order'), await alerts('refund')]).toEqual([['New order · ₹498', 'New order · ₹399'], []]);
    await vi.waitFor(() => expect(pushed()).toEqual(['New order · ₹498', 'New order · ₹399']));
  });
});

describe('metric import', () => {
  let meta;
  let launch;
  let foreign;

  beforeAll(async () => {
    meta = await createProduct({ name: 'Meta ads product' });
    launch = await createExperiment(meta._id, { name: 'Meta launch', campaign: 'meta-launch' });
    foreign = await createExperiment(other._id, { name: 'Foreign test' });
  });

  const importMetrics = (rows, body) => api.post('/metrics/import', { productId: meta._id, rows, ...body });
  const values = (row) => Object.fromEntries(METRIC_FIELDS.map((f) => [f, row[f] ?? 0]));
  const key = (row) => [row.date, row.campaign ?? '', row.adSet ?? ''].join('|');
  const stored = async (experimentId = null) =>
    Object.fromEntries((await CampaignMetric.find({ productId: meta._id, experimentId }).lean()).map((d) => [key(d), values(d)]));
  const first = [
    day('2026-09-01'),
    day('2026-09-01', { adSet: 'Lookalike', spend: 50 }),
    day('2026-09-02', { campaign: undefined, adSet: undefined, notes: 'Boosted post' }),
  ];

  it('creates one row per day, campaign and ad set', async () => {
    const res = await importMetrics(first);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(metricResult({ created: 3 }));
    expect(await stored()).toEqual(Object.fromEntries(first.map((row) => [key(row), values(row)])));
    expect(await CampaignMetric.findOne({ productId: meta._id, campaign: '' }).lean()).toMatchObject({
      experimentId: null,
      creativeId: null,
      adSet: '',
      notes: 'Boosted post',
    });
  });

  it('replaces existing rows with the file values and is idempotent', async () => {
    expect((await importMetrics(first)).body).toEqual(metricResult({ unchanged: 3 }));
    const corrected = { date: '2026-09-01', campaign: 'Sales', adSet: 'Broad', spend: 120, clicks: 25 };
    expect((await importMetrics([corrected])).body).toEqual(metricResult({ updated: 1 }));
    expect((await stored())['2026-09-01|Sales|Broad']).toEqual(values(corrected));
    expect((await importMetrics([corrected])).body).toEqual(metricResult({ unchanged: 1 }));
    expect(await CampaignMetric.countDocuments({ productId: meta._id })).toBe(3);
  });

  it('leaves existing rows alone in skip mode', async () => {
    const res = await importMetrics([day('2026-09-01', { spend: 999 }), day('2026-09-03')], { mode: 'skip' });
    expect(res.body).toEqual(metricResult({ created: 1, unchanged: 1 }));
    const rows = await stored();
    expect(rows['2026-09-01|Sales|Broad'].spend).toBe(120);
    expect(rows['2026-09-03|Sales|Broad']).toEqual(values(day('2026-09-03')));
  });

  it('sums rows that share a day, campaign and ad set', async () => {
    const adRows = [
      day('2026-09-05', { spend: 10.1 }),
      day('2026-09-05', { spend: 20.2, purchases: 2, revenue: undefined }),
      day('2026-09-05', { adSet: 'Retargeting' }),
    ];
    expect((await importMetrics(adRows)).body).toEqual(metricResult({ created: 2 }));
    expect((await stored())['2026-09-05|Sales|Broad']).toEqual({
      spend: 30.3,
      impressions: 2000,
      reach: 1600,
      clicks: 40,
      landingPageViews: 30,
      checkouts: 6,
      purchases: 3,
      revenue: 399,
    });
    expect((await importMetrics(adRows)).body).toEqual(metricResult({ unchanged: 2 }));
  });

  it('keeps rows of an experiment apart from product-level rows', async () => {
    expect((await importMetrics([day('2026-09-01')], { experimentId: launch._id })).body).toEqual(metricResult({ created: 1 }));
    expect(await stored(launch._id)).toEqual({ '2026-09-01|Sales|Broad': values(day('2026-09-01')) });
    expect((await stored())['2026-09-01|Sales|Broad'].spend).toBe(120);
    expect((await importMetrics([day('2026-09-01')], { experimentId: launch._id })).body).toEqual(metricResult({ unchanged: 1 }));
  });

  it.each([
    [
      "another product's experiment",
      () => ({ experimentId: foreign._id }),
      'Experiment belongs to another product',
      { experimentId: 'Experiment belongs to another product' },
    ],
    ['an unknown experiment', () => ({ experimentId: MISSING_ID }), 'Experiment not found', { experimentId: 'Experiment not found' }],
    ['an unknown product', () => ({ productId: MISSING_ID }), 'Product not found', { productId: 'Product not found' }],
    ['an unknown mode', () => ({ mode: 'merge' }), FIX, { mode: 'Choose a valid option' }],
    ['more than 2000 rows', () => ({ rows: many(2001, () => day('2026-09-09')) }), FIX, { rows: 'Import at most 2000 rows at a time' }],
  ])('rejects %s', async (_, body, message, fields) => {
    const res = await api.post('/metrics/import', { productId: meta._id, rows: [day('2026-09-09')], ...body() });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message, fields } });
    expect(await CampaignMetric.countDocuments({ date: '2026-09-09' })).toBe(0);
  });

  it('reports invalid rows without blocking the others', async () => {
    const res = await importMetrics([day('2026-9-1'), day('2026-09-11', { impressions: 1.5, spend: -1 }), day('2026-09-12'), null]);
    expect(res.body).toEqual(
      metricResult({
        created: 1,
        failed: [
          { row: 0, message: 'date: Use a YYYY-MM-DD date', fields: { date: 'Use a YYYY-MM-DD date' } },
          {
            row: 1,
            message: 'spend: Must be at least 0; impressions: Enter a whole number',
            fields: { spend: 'Must be at least 0', impressions: 'Enter a whole number' },
          },
          { row: 3, message: 'Required', fields: { _: 'Required' } },
        ],
      }),
    );
    expect(Object.keys(await stored()).filter((k) => k.startsWith('2026-09-1'))).toEqual(['2026-09-12|Sales|Broad']);
  });

  it('previews an import with the same counts without writing anything', async () => {
    const rows = [
      day('2026-09-01', { spend: 1 }),
      day('2026-09-03'),
      day('2026-09-20'),
      day('2026-09-20', { spend: 5 }),
      { date: 'yesterday' },
    ];
    const state = async () => JSON.stringify(await CampaignMetric.find().sort({ _id: 1 }).lean());
    const before = await state();
    const preview = await importMetrics(rows, { dryRun: true });
    expect(preview.body).toEqual(
      metricResult({
        created: 1,
        updated: 1,
        unchanged: 1,
        failed: [{ row: 4, message: 'date: Use a YYYY-MM-DD date', fields: { date: 'Use a YYYY-MM-DD date' } }],
      }),
    );
    expect(await state()).toBe(before);
    expect((await importMetrics(rows)).body).toEqual(preview.body);
    expect((await stored())['2026-09-20|Sales|Broad'].spend).toBe(105);
  });

  it('announces experiment milestones only for rows dated today or yesterday', async () => {
    await prefs({ experimentMilestone: true });
    try {
      const test = await createExperiment(meta._id, { name: 'Milestone test' });
      await importMetrics([day('2026-09-10', { purchases: 12 })], { experimentId: test._id });
      expect(await alerts('experiment_milestone')).toEqual([]);
      await importMetrics([day('2026-09-28', { purchases: 7 }), day('2026-09-29', { purchases: 7 })], { experimentId: test._id });
      expect(await alerts('experiment_milestone')).toEqual(['Milestone test crossed 25 purchases']);
    } finally {
      await prefs({ experimentMilestone: false });
    }
  });
});

describe('import requests', () => {
  const routes = [
    ['/orders/import', () => ({ productId: satsang._id, rows: [order('SEC-1')] })],
    ['/metrics/import', () => ({ productId: satsang._id, rows: [day('2026-09-15')] })],
  ];

  it.each(routes)('POST %s requires a session and a same-origin request', async (path, body) => {
    const anonymous = await anon('post', path).send(body());
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual({ error: { message: 'Not signed in' } });
    for (const site of ['cross-site', 'same-site']) {
      const res = await api.post(path, body()).set('Sec-Fetch-Site', site);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: { message: 'Cross-site request blocked' } });
    }
    expect(await Order.countDocuments({ externalId: 'SEC-1' })).toBe(0);
    expect(await CampaignMetric.countDocuments({ date: '2026-09-15' })).toBe(0);
    expect((await api.post(path, { ...body(), dryRun: true }).set('Sec-Fetch-Site', 'same-origin')).status).toBe(200);
  });

  const long = { campaign: 'c'.repeat(200), notes: 'x'.repeat(1000) };
  const longItems = many(4, () => ({ ...MAIN, name: 'i'.repeat(200) }));
  const longOrder = (i) => order(`BULK-${i}`, { ...long, name: 'n'.repeat(120), items: longItems });

  it.each([
    ['/orders/import', () => ({ productId: satsang._id, rows: many(500, longOrder) })],
    ['/metrics/import', () => ({ productId: satsang._id, rows: many(2000, () => day('2026-09-16', { ...long, adSet: 'a'.repeat(200) })) })],
  ])('accepts a full POST %s request over 1 MB', async (path, body) => {
    const payload = { ...body(), dryRun: true };
    expect(JSON.stringify(payload).length).toBeGreaterThan(1_100_000);
    const res = await api.post(path, payload);
    expect(res.status).toBe(200);
    expect(res.body.failed).toEqual([]);
  });

  it.each(['/orders/import', '/metrics/import'])('keeps the 1 MB limit for POST %s without a session', async (path) => {
    const body = (size) => ({ productId: satsang._id, dryRun: true, rows: ['x'.repeat(size)] });
    const anonymous = await anon('post', path).send(body(1_100_000));
    expect(anonymous.status).toBe(413);
    expect(anonymous.body).toEqual({ error: { message: 'Request is too large' } });
    expect((await anon('post', path).send(body(10))).status).toBe(401);
    expect((await api.post(path, body(1_100_000))).status).toBe(200);
    expect((await api.post(path, body(5_500_000))).status).toBe(413);
  });
});
