import { addDays, startOfDayIn } from '@product-lab/shared/dates';
import Customer from '../models/Customer.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { orderAlerts } from '../services/alerts.js';
import { recalcCustomers } from '../services/customers.js';
import { alertFailed, applyOrder, assertRefs, importOrders, resolveCustomer } from '../services/orders.js';
import { timezone } from '../services/settings.js';
import { idMap, notFound, searchRegex, sortSpec } from '../utils/http.js';
import { serial } from '../utils/serial.js';

const SORTS = ['date', 'amount', 'createdAt'];

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
  const order = applyOrder(new Order(), body, await timezone());
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
  const { customer, customerId, ...body } = req.body;
  if (body.productId || body.experimentId) {
    await assertRefs(body.productId ?? order.productId, 'experimentId' in body ? body.experimentId : order.experimentId);
  }
  applyOrder(order, body, await timezone());
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

export async function importRows(req, res) {
  res.json(await serial(req.body.productId, () => importOrders(req.body)));
}
