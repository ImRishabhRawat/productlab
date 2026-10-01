import mongoose from 'mongoose';
import { round } from '@product-lab/shared/metrics';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';

export async function recalcCustomers(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  await Promise.all(
    unique.map(async (id) => {
      const [stats] = await Order.aggregate([
        { $match: { customerId: new mongoose.Types.ObjectId(id), paymentStatus: 'paid' } },
        {
          $group: {
            _id: null,
            totalSpent: { $sum: { $subtract: ['$amount', { $ifNull: ['$refundAmount', 0] }] } },
            orderCount: { $sum: 1 },
            firstPurchaseAt: { $min: '$date' },
            lastPurchaseAt: { $max: '$date' },
            productIds: { $addToSet: '$productId' },
          },
        },
      ]);
      await Customer.updateOne(
        { _id: id },
        {
          $set: {
            totalSpent: round(stats?.totalSpent ?? 0),
            orderCount: stats?.orderCount ?? 0,
            firstPurchaseAt: stats?.firstPurchaseAt ?? null,
            lastPurchaseAt: stats?.lastPurchaseAt ?? null,
            productIds: stats?.productIds ?? [],
          },
        },
      );
    }),
  );
}
