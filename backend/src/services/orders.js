import { isISODate, startOfDayIn } from '@product-lab/shared/dates';
import { round } from '@product-lab/shared/metrics';
import { orderImportRowSchema, parseRows } from '@product-lab/shared/schemas';
import Customer from '../models/Customer.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { HttpError, badRequest } from '../utils/http.js';
import { orderAlerts } from './alerts.js';
import { recalcCustomers } from './customers.js';
import { timezone } from './settings.js';

const ALERT_WINDOW_MS = 86_400_000;

export const alertFailed = (err) => console.error(`Order alert failed: ${err.message}`);
const sumItems = (items) => round(items.reduce((s, i) => s + i.amount, 0));
const toInstant = (value, tz) => (isISODate(value) ? startOfDayIn(value, tz) : new Date(value));
const idOf = (row) => (typeof row?.externalId === 'string' ? row.externalId.trim() : '');

export async function resolveCustomer({ customerId, customer }) {
  if (customerId) {
    if (!(await Customer.exists({ _id: customerId }))) throw badRequest('Customer not found', { customerId: 'Customer not found' });
    return customerId;
  }
  if (!customer?.email) throw badRequest('Enter a customer email', { 'customer.email': 'Enter a customer email' });
  const doc = await Customer.findOneAndUpdate(
    { email: customer.email },
    { $setOnInsert: { email: customer.email, name: customer.name ?? '', phone: customer.phone ?? '' } },
    { upsert: true, returnDocument: 'after' },
  );
  for (const key of ['name', 'phone']) if (customer[key] && !doc[key]) doc[key] = customer[key];
  if (doc.isModified()) await doc.save();
  return doc._id;
}

export async function assertRefs(productId, experimentId) {
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

export function applyOrder(order, { items, date, ...fields }, tz) {
  if (items) order.set({ items, amount: sumItems(items) });
  if (date) order.date = toInstant(date, tz);
  order.set(fields);
  normalizeRefund(order);
  return order;
}

export async function importOrders({ productId, rows, dryRun }) {
  await assertRefs(productId);
  const tz = await timezone();
  const { valid, failed: invalid } = parseRows(orderImportRowSchema, rows);
  const failed = invalid.map(({ row, ...error }) => ({ row, externalId: idOf(rows[row]), ...error }));
  const existing = new Map((await Order.find({ externalId: { $in: valid.map((v) => v.data.externalId) } })).map((o) => [o.externalId, o]));
  const seen = new Set();
  const contacts = new Map();
  const created = [];
  const updated = [];
  let unchanged = 0;

  for (const { row, data } of valid) {
    const { externalId, email, name, phone, notes, ...changes } = data;
    const fail = (message, fields = { externalId: message }) => failed.push({ row, externalId, message, fields });
    if (seen.has(externalId)) {
      fail('Duplicate order ID in this file');
      continue;
    }
    seen.add(externalId);
    const order = existing.get(externalId) ?? new Order({ productId, externalId, notes });
    if (!order.productId.equals(productId)) {
      fail(`Order ${externalId} belongs to another product`);
      continue;
    }
    const previous = order.isNew ? null : { paymentStatus: order.paymentStatus, refundStatus: order.refundStatus };
    try {
      applyOrder(order, changes, tz);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      fail(err.message, err.fields);
      continue;
    }
    if (order.isNew) {
      const contact = contacts.get(email) ?? { email };
      contacts.set(email, { ...contact, name: contact.name || name, phone: contact.phone || phone });
      created.push({ order, previous, email });
    } else if (order.isModified()) updated.push({ order, previous });
    else unchanged += 1;
  }

  const customersCreated = contacts.size - (await Customer.countDocuments({ email: { $in: [...contacts.keys()] } }));
  if (!dryRun) {
    const customerIds = new Map(
      await Promise.all([...contacts.values()].map(async (c) => [c.email, await resolveCustomer({ customer: c })])),
    );
    for (const c of created) c.order.customerId = customerIds.get(c.email);
    const written = [...created, ...updated];
    if (written.length) await Order.bulkSave(written.map((w) => w.order));
    await recalcCustomers(written.map((w) => w.order.customerId));
    const since = Date.now() - ALERT_WINDOW_MS;
    for (const { order, previous } of written) {
      if (order.date.getTime() >= since) await orderAlerts(order, previous).catch(alertFailed);
    }
  }
  return { created: created.length, updated: updated.length, unchanged, customersCreated, failed: failed.sort((a, b) => a.row - b.row) };
}
