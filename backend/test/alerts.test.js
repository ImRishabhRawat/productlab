import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import Goal from '../src/models/Goal.js';
import Notification from '../src/models/Notification.js';
import { NOW, api, create, createExperiment, createProduct, setNow, setupApi } from './setup.js';

setupApi();
afterEach(() => setNow(NOW));

async function alerts(type) {
  const items = await Notification.find({ type }).sort({ createdAt: 1, _id: 1 }).lean();
  return items.map(({ title, body, url }) => ({ title, body, url }));
}
const prefs = (business) => api.patch('/notification-preferences', { business });

let planner;

beforeAll(async () => {
  await Notification.init();
  await prefs({ refund: true, experimentMilestone: true, goalReached: true });
  planner = await createProduct({ name: 'Planner', price: 500 });
});

describe('order alerts', () => {
  const order = (body) =>
    create('/orders', {
      productId: planner._id,
      customer: { email: 'asha@example.com' },
      items: [{ kind: 'main', amount: 500 }],
      date: '2026-09-29',
      ...body,
    });

  it('announces new paid orders only when switched on', async () => {
    await order();
    expect(await alerts('new_order')).toEqual([]);
    await prefs({ newOrder: true });
    await order({ items: [{ kind: 'main', amount: 500 }, { kind: 'bump', amount: 99 }] });
    await order({ paymentStatus: 'failed' });
    expect(await alerts('new_order')).toEqual([
      { title: 'New order · ₹599', body: 'Planner · Main product + Order bump', url: `/products/${planner._id}` },
    ]);
  });

  it('announces a pending order once when it is paid', async () => {
    const pending = await order({ paymentStatus: 'pending' });
    expect(await alerts('new_order')).toHaveLength(1);
    await api.patch(`/orders/${pending._id}`, { paymentStatus: 'paid' });
    await api.patch(`/orders/${pending._id}`, { notes: 'Paid by UPI' });
    await api.patch(`/orders/${pending._id}`, { paymentStatus: 'pending' });
    await api.patch(`/orders/${pending._id}`, { paymentStatus: 'paid' });
    expect((await alerts('new_order')).map((a) => a.title)).toEqual(['New order · ₹599', 'New order · ₹500']);
  });

  it('announces each refund step once', async () => {
    await order({ refundStatus: 'full' });
    const partial = await order({ items: [{ kind: 'main', amount: 650 }] });
    await api.patch(`/orders/${partial._id}`, { refundStatus: 'partial', refundAmount: 200 });
    await api.patch(`/orders/${partial._id}`, { refundStatus: 'full' });
    await api.patch(`/orders/${partial._id}`, { notes: 'Refunded in full' });
    const url = `/products/${planner._id}`;
    expect(await alerts('refund')).toEqual([
      { title: 'Refund · ₹500', body: 'Planner · Refunded', url },
      { title: 'Refund · ₹200', body: 'Planner · Partial refund', url },
      { title: 'Refund · ₹650', body: 'Planner · Refunded', url },
    ]);
    await prefs({ refund: false });
    await order({ refundStatus: 'full' });
    expect(await alerts('refund')).toHaveLength(3);
    await prefs({ refund: true });
  });
});

describe('experiment milestones', () => {
  it('announces each purchase milestone once', async () => {
    const launch = await createExperiment(planner._id, { name: 'Planner launch' });
    const entry = await create('/metrics', { experimentId: launch._id, date: '2026-09-20', spend: 600, revenue: 3000, purchases: 6 });
    expect(await alerts('experiment_milestone')).toEqual([]);
    await create('/metrics', { experimentId: launch._id, date: '2026-09-21', spend: 500, revenue: 2500, purchases: 5 });
    expect(await alerts('experiment_milestone')).toEqual([
      { title: 'Planner launch crossed 10 purchases', body: 'CAC ₹100 · ROAS 5x so far', url: `/experiments/${launch._id}` },
    ]);
    await create('/metrics', { experimentId: launch._id, date: '2026-09-22', purchases: 2 });
    await api.patch(`/metrics/${entry._id}`, { purchases: 20 });
    await api.patch(`/metrics/${entry._id}`, { purchases: 10 });
    await create('/metrics', { experimentId: launch._id, date: '2026-09-23', purchases: 10 });
    expect((await alerts('experiment_milestone')).map((a) => a.title)).toEqual([
      'Planner launch crossed 10 purchases',
      'Planner launch crossed 25 purchases',
    ]);
  });

  it('announces only the highest milestone of a jump and leaves out ROAS without spend', async () => {
    const organic = await createExperiment(planner._id, { name: 'Organic push' });
    await create('/metrics', { experimentId: organic._id, date: '2026-09-20', revenue: 30000, purchases: 60 });
    const organicAlerts = (await alerts('experiment_milestone')).filter((a) => a.title.startsWith('Organic'));
    expect(organicAlerts).toEqual([
      { title: 'Organic push crossed 50 purchases', body: 'CAC ₹0 so far', url: `/experiments/${organic._id}` },
    ]);
  });

  it('stays quiet when milestone alerts are off', async () => {
    await prefs({ experimentMilestone: false });
    const quiet = await createExperiment(planner._id, { name: 'Quiet test' });
    await create('/metrics', { experimentId: quiet._id, date: '2026-09-20', purchases: 12 });
    expect((await alerts('experiment_milestone')).some((a) => a.title.startsWith('Quiet'))).toBe(false);
    await prefs({ experimentMilestone: true });
  });
});

describe('goal alerts', () => {
  let kids;

  beforeAll(async () => {
    kids = await createProduct({ name: 'Kids videos' });
  });

  it('marks a revenue goal reached once and announces a raised target again', async () => {
    const goal = await create('/goals', {
      title: 'September revenue',
      level: 'monthly',
      category: 'money',
      tracking: 'revenue',
      targetValue: 5000,
      startDate: '2026-09-01',
      targetDate: '2026-09-30',
      productIds: [kids._id],
    });
    await create('/metrics', { productId: kids._id, date: '2026-09-10', revenue: 3000 });
    expect((await Goal.findById(goal._id).lean()).achievedAt).toBeNull();
    setNow('2026-09-29T08:00:00.000Z');
    await create('/metrics', { productId: kids._id, date: '2026-09-11', revenue: 2500 });
    const url = `/goals/${goal._id}`;
    expect(await alerts('goal_reached')).toEqual([{ title: 'Goal reached: September revenue', body: '₹5,500 of ₹5,000 target', url }]);
    const reached = (await api.get(`/goals/${goal._id}`)).body;
    expect(reached).toMatchObject({ status: 'active', achievedAt: '2026-09-29T08:00:00.000Z', progress: 100 });

    setNow('2026-09-29T09:00:00.000Z');
    await create('/metrics', { productId: kids._id, date: '2026-09-12', revenue: 1000 });
    expect(await alerts('goal_reached')).toHaveLength(1);
    expect((await Goal.findById(goal._id).lean()).achievedAt).toEqual(new Date('2026-09-29T08:00:00.000Z'));

    expect((await api.patch(`/goals/${goal._id}`, { targetValue: 10000 })).body).toMatchObject({ achievedAt: null, progress: 65 });
    await create('/metrics', { productId: kids._id, date: '2026-09-13', revenue: 4000 });
    expect(await alerts('goal_reached')).toEqual([
      { title: 'Goal reached: September revenue', body: '₹5,500 of ₹5,000 target', url },
      { title: 'Goal reached: September revenue', body: '₹10,500 of ₹10,000 target', url },
    ]);
  });

  it('counts purchases and ignores goals that do not follow the product results', async () => {
    const base = { level: 'monthly', category: 'business', targetValue: 10, startDate: '2026-09-01', productIds: [kids._id] };
    const purchases = await create('/goals', { ...base, title: 'Ten sales', tracking: 'purchases' });
    const manual = await create('/goals', { ...base, title: 'Manual', currentValue: 50 });
    const paused = await create('/goals', { ...base, title: 'Paused', tracking: 'purchases', status: 'paused' });
    const otherProduct = { tracking: 'purchases', targetValue: 1000, productIds: [planner._id] };
    const other = await create('/goals', { ...base, title: 'Other product', ...otherProduct });
    await create('/metrics', { productId: kids._id, date: '2026-09-14', purchases: 12 });
    expect((await alerts('goal_reached')).filter((a) => a.title === 'Goal reached: Ten sales')).toEqual([
      { title: 'Goal reached: Ten sales', body: '12 of 10 target', url: `/goals/${purchases._id}` },
    ]);
    const achieved = async (g) => (await Goal.findById(g._id).lean()).achievedAt;
    expect([await achieved(manual), await achieved(paused), await achieved(other)]).toEqual([null, null, null]);
  });

  it('records the achievement without a notification when goal alerts are off', async () => {
    await prefs({ goalReached: false });
    const goal = await create('/goals', {
      title: 'Quiet goal',
      level: 'monthly',
      category: 'money',
      tracking: 'revenue',
      targetValue: 100,
      startDate: '2026-09-01',
      productIds: [kids._id],
    });
    await create('/metrics', { productId: kids._id, date: '2026-09-15', revenue: 100 });
    expect((await Goal.findById(goal._id).lean()).achievedAt).toEqual(new Date(NOW));
    expect((await alerts('goal_reached')).some((a) => a.title === 'Goal reached: Quiet goal')).toBe(false);
    await prefs({ goalReached: true });
  });

  it('waits for the full target before calling a goal reached', async () => {
    const product = await createProduct({ name: 'Almost there' });
    const base = { level: 'monthly', category: 'money', tracking: 'revenue', startDate: '2026-09-01', productIds: [product._id] };
    const goal = await create('/goals', { ...base, title: 'Rs 1 lakh revenue', targetValue: 100000 });
    await create('/metrics', { productId: product._id, date: '2026-09-20', revenue: 99960 });
    expect((await api.get(`/goals/${goal._id}`)).body).toMatchObject({ current: 99960, progress: 99.9, achievedAt: null });
    const reached = async () => (await alerts('goal_reached')).filter((a) => a.title === 'Goal reached: Rs 1 lakh revenue');
    expect(await reached()).toEqual([]);
    await create('/metrics', { productId: product._id, date: '2026-09-21', revenue: 40 });
    expect(await reached()).toEqual([
      { title: 'Goal reached: Rs 1 lakh revenue', body: '₹1,00,000 of ₹1,00,000 target', url: `/goals/${goal._id}` },
    ]);
  });

  it('marks a goal reached as soon as it is created or retargeted at or below the recorded result', async () => {
    const product = await createProduct({ name: 'Early win' });
    await create('/metrics', { productId: product._id, date: '2026-09-10', revenue: 60000 });
    const window = { startDate: '2026-09-01', targetDate: '2026-09-30', productIds: [product._id] };
    const base = { level: 'monthly', category: 'money', tracking: 'revenue', ...window };
    const first = await create('/goals', { ...base, title: 'Early ₹50k', targetValue: 50000 });
    expect(first).toMatchObject({ progress: 100, achievedAt: NOW });
    const later = await create('/goals', { ...base, title: 'Early ₹80k', targetValue: 80000 });
    expect(later).toMatchObject({ progress: 75, achievedAt: null });
    setNow('2026-09-29T09:00:00.000Z');
    const retargeted = await api.patch(`/goals/${later._id}`, { targetValue: 60000 });
    expect(retargeted.body).toMatchObject({ progress: 100, achievedAt: '2026-09-29T09:00:00.000Z' });
    const titles = (await alerts('goal_reached')).map((a) => a.title).filter((t) => t.startsWith('Goal reached: Early'));
    expect(titles).toEqual(['Goal reached: Early ₹50k', 'Goal reached: Early ₹80k']);
  });
});
