import mongoose from 'mongoose';
import { round } from '@product-lab/shared/metrics';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';

const noPurchases = () => ({ totalSpent: 0, orderCount: 0, firstPurchaseAt: null, lastPurchaseAt: null, productIds: [] });

export async function upsertCustomers(contacts) {
  if (!contacts.length) return new Map();
  await Customer.bulkWrite(
    contacts.flatMap(({ email, name = '', phone = '' }) => [
      { updateOne: { filter: { email }, update: { $setOnInsert: { email, name, phone } }, upsert: true } },
      ...Object.entries({ name, phone })
        .filter(([, value]) => value)
        .map(([key, value]) => ({ updateOne: { filter: { email, [key]: { $in: ['', null] } }, update: { $set: { [key]: value } } } })),
    ]),
  );
  const docs = await Customer.find({ email: { $in: contacts.map((c) => c.email) } }).select('email').lean();
  return new Map(docs.map((d) => [d.email, d._id]));
}

export async function recalcCustomers(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return;
  const stats = await Order.aggregate([
    { $match: { customerId: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) }, paymentStatus: 'paid' } },
    {
      $group: {
        _id: '$customerId',
        totalSpent: { $sum: { $subtract: ['$amount', { $ifNull: ['$refundAmount', 0] }] } },
        orderCount: { $sum: 1 },
        firstPurchaseAt: { $min: '$date' },
        lastPurchaseAt: { $max: '$date' },
        productIds: { $addToSet: '$productId' },
      },
    },
  ]);
  const byId = new Map(stats.map(({ _id, ...s }) => [String(_id), { ...s, totalSpent: round(s.totalSpent) }]));
  await Customer.bulkWrite(unique.map((id) => ({ updateOne: { filter: { _id: id }, update: { $set: byId.get(id) ?? noPurchases() } } })));
}
