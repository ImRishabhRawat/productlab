import { isISODate, startOfDayIn } from '@product-lab/shared/dates';
import { round } from '@product-lab/shared/metrics';
import { orderImportRowSchema, parseRows } from '@product-lab/shared/schemas';
import Customer from '../models/Customer.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { HttpError, badRequest } from '../utils/http.js';
import { orderAlerts } from './alerts.js';
import { recalcCustomers, upsertCustomers } from './customers.js';
import { timezone } from './settings.js';

const ALERT_WINDOW_MS = 86_400_000;

export const alertFailed = (err) => console.error(`Order alert failed: ${err.message}`);
const sumItems = (items) => round(items.reduce((s, i) => s + i.amount, 0));
const toInstant = (value, tz) => (isISODate(value) ? startOfDayIn(value, tz) : new Date(value));
const idOf = (row) => (typeof row?.externalId === 'string' ? row.externalId.trim() : '');
const onlyDuplicates = (err) => err.writeErrors?.length > 0 && err.writeErrors.every((e) => e.code === 11000);

export async function resolveCustomer({ customerId, customer }) {
  if (customerId) {
    if (!(await Customer.exists({ _id: customerId }))) throw badRequest('Customer not found', { customerId: 'Customer not found' });
    return customerId;
  }
  if (!customer?.email) throw badRequest('Enter a customer email', { 'customer.email': 'Enter a customer email' });
  return (await upsertCustomers([customer])).get(customer.email);
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

async function saveOrders(written, customerIds) {
  try {
    if (written.length) await Order.bulkSave(written.map((w) => w.order), { ordered: false });
  } catch (err) {
    if (!onlyDuplicates(err)) throw err;
  } finally {
    await recalcCustomers(customerIds);
  }
  return written.filter((w) => w.order.isNew);
}

export async function importOrders({ productId, rows, dryRun }) {
  await assertRefs(productId);
  const tz = await timezone();
  const { valid, failed: invalid } = parseRows(orderImportRowSchema, rows);
  const failed = invalid.map(({ row, ...error }) => ({ row, externalId: idOf(rows[row]), ...error }));
  const ids = valid.map((v) => v.data.externalId);
  const existing = new Map((await Order.find({ externalId: { $in: ids, $type: 'string' } })).map((o) => [o.externalId, o]));
  const seen = new Set();
  const contacts = new Map();
  const created = [];
  const updated = [];
  const matched = [];
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
    if (!order.isNew && sumItems(changes.items) === order.amount) delete changes.items;
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
      created.push({ row, order, previous, email });
    } else if (order.isModified()) updated.push({ order, previous });
    else {
      unchanged += 1;
      matched.push(order.customerId);
    }
  }

  const customersCreated = contacts.size - (await Customer.countDocuments({ email: { $in: [...contacts.keys()] } }));
  let lost = [];
  if (!dryRun) {
    const customerIds = await upsertCustomers([...contacts.values()]);
    for (const c of created) c.order.customerId = customerIds.get(c.email);
    const written = [...created, ...updated];
    lost = await saveOrders(written, [...written.map((w) => w.order.customerId), ...matched]);
    const now = Date.now();
    for (const { order, previous } of written) {
      const at = order.date.getTime();
      if (!order.isNew && at >= now - ALERT_WINDOW_MS && at <= now) await orderAlerts(order, previous).catch(alertFailed);
    }
  }
  for (const { row, order } of lost) {
    const message = `Order ${order.externalId} was imported by another import at the same time`;
    failed.push({ row, externalId: order.externalId, message, fields: { externalId: message } });
  }
  return {
    created: created.length - lost.length,
    updated: updated.length,
    unchanged,
    customersCreated,
    failed: failed.sort((a, b) => a.row - b.row),
  };
}
