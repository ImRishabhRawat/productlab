import { addDays, isISODate, startOfDayIn } from '@product-lab/shared/dates';
import { round } from '@product-lab/shared/metrics';
import Customer from '../models/Customer.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { orderAlerts } from '../services/alerts.js';
import { recalcCustomers } from '../services/customers.js';
import { timezone } from '../services/settings.js';
import { badRequest, idMap, notFound, searchRegex, sortSpec } from '../utils/http.js';

const alertFailed = (err) => console.error(`Order alert failed: ${err.message}`);
const SORTS = ['date', 'amount', 'createdAt'];
const sumItems = (items) => round(items.reduce((s, i) => s + i.amount, 0));
const toInstant = (value, tz) => (isISODate(value) ? startOfDayIn(value, tz) : new Date(value));

async function resolveCustomer({ customerId, customer }) {
  if (customerId) {
    if (!(await Customer.exists({ _id: customerId }))) throw badRequest('Customer not found', { customerId: 'Customer not found' });
    return customerId;
  }
  if (!customer?.email) throw badRequest('Enter a customer email', { 'customer.email': 'Enter a customer email' });
  const doc = await Customer.findOneAndUpdate(
    { email: customer.email },
    { $setOnInsert: { email: customer.email, name: customer.name ?? '' } },
    { upsert: true, returnDocument: 'after' },
  );
  if (customer.name && !doc.name) {
    doc.name = customer.name;
    await doc.save();
  }
  return doc._id;
}

async function assertRefs(productId, experimentId) {
  if (!(await Product.exists({ _id: productId }))) throw badRequest('Product not found', { productId: 'Product not found' });
  if (experimentId && !(await Experiment.exists({ _id: experimentId, productId }))) {
    throw badRequest('Experiment not found for this product', { experimentId: 'Experiment not found for this product' });
  }
}

function normalizeRefund(order) {
  if (order.refundStatus === 'none') order.refundAmount = 0;
  if (order.refundStatus === 'full') order.refundAmount = order.amount;
  if (order.refundAmount > order.amount) throw badRequest('Refund exceeds the order amount', { refundAmount: 'Refund exceeds the order amount' });
  if (order.refundStatus === 'partial' && !(order.refundAmount > 0)) {
    throw badRequest('Enter the refunded amount', { refundAmount: 'Enter the refunded amount' });
  }
}

async function withRefs(orders) {
  const [customers, products, experiments] = await Promise.all([
    Customer.find({ _id: { $in: orders.map((o) => o.customerId) } }).select('name email').lean(),
    Product.find({ _id: { $in: orders.map((o) => o.productId) } }).select('name').lean(),
    Experiment.find({ _id: { $in: orders.map((o) => o.experimentId).filter(Boolean) } }).select('name').lean(),
  ]);
  const c = idMap(customers);
  const p = idMap(products);
  const x = idMap(experiments);
  return orders.map((o) => ({
    ...o,
    customer: c.get(String(o.customerId)) ?? null,
    productName: p.get(String(o.productId))?.name ?? '',
    experimentName: x.get(String(o.experimentId))?.name ?? '',
  }));
}

export async function list(req, res) {
  const f = req.filters;
  const { limit = 50, offset = 0 } = f;
  const tz = await timezone();
  const filter = {};
  for (const key of ['productId', 'experimentId', 'customerId', 'paymentStatus', 'refundStatus', 'campaign']) {
    if (f[key]) filter[key] = f[key];
  }
  if (f.kind) filter['items.kind'] = f.kind;
  if (f.from || f.to) {
    filter.date = {};
    if (f.from) filter.date.$gte = startOfDayIn(f.from, tz);
    if (f.to) filter.date.$lt = startOfDayIn(addDays(f.to, 1), tz);
  }
  if (f.q) {
    const rx = searchRegex(f.q);
    const customers = await Customer.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').limit(500).lean();
    filter.$or = [{ customerId: { $in: customers.map((c) => c._id) } }, { 'items.name': rx }, { campaign: rx }, { notes: rx }];
  }
  const [rows, total, campaigns] = await Promise.all([
    Order.find(filter).sort(sortSpec(f.sort, SORTS, { date: -1 })).skip(offset).limit(limit).lean(),
    Order.countDocuments(filter),
    Order.distinct('campaign', f.productId ? { productId: f.productId } : {}),
  ]);
  res.json({ items: await withRefs(rows), total, facets: { campaigns: campaigns.filter(Boolean).sort() } });
}

export async function get(req, res) {
  const order = await Order.findById(req.params.id).lean();
  if (!order) throw notFound('Order');
  const [withNames] = await withRefs([order]);
  res.json(withNames);
}

export async function create(req, res) {
  const { customer, customerId, ...body } = req.body;
  await assertRefs(body.productId, body.experimentId);
  const order = new Order({
    ...body,
    experimentId: body.experimentId || null,
    amount: sumItems(body.items),
    date: toInstant(body.date, await timezone()),
  });
  normalizeRefund(order);
  order.customerId = await resolveCustomer({ customerId, customer });
  await order.save();
  await recalcCustomers([order.customerId]);
  await orderAlerts(order).catch(alertFailed);
  res.status(201).json(order);
}

export async function update(req, res) {
  const order = await Order.findById(req.params.id);
  if (!order) throw notFound('Order');
  const previousCustomer = order.customerId;
  const previous = { paymentStatus: order.paymentStatus, refundStatus: order.refundStatus };
  const { customer, customerId, date, items, ...body } = req.body;
  if (body.productId || body.experimentId) {
    await assertRefs(body.productId ?? order.productId, 'experimentId' in body ? body.experimentId : order.experimentId);
  }
  if (items) {
    order.items = items;
    order.amount = sumItems(items);
  }
  if (date) order.date = toInstant(date, await timezone());
  order.set(body);
  normalizeRefund(order);
  if (customerId || customer) order.customerId = await resolveCustomer({ customerId, customer });
  await order.save();
  await recalcCustomers([previousCustomer, order.customerId]);
  await orderAlerts(order, previous).catch(alertFailed);
  res.json(order);
}

export async function remove(req, res) {
  const order = await Order.findByIdAndDelete(req.params.id);
  if (!order) throw notFound('Order');
  await recalcCustomers([order.customerId]);
  res.status(204).end();
}
