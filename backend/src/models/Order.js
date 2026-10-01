import mongoose from 'mongoose';
import { ORDER_ITEM_KINDS, PAYMENT_STATUSES, REFUND_STATUSES } from '@product-lab/shared/constants';

const { Schema } = mongoose;

const itemSchema = new Schema(
  {
    kind: { type: String, enum: ORDER_ITEM_KINDS, required: true },
    name: { type: String, trim: true, default: '' },
    amount: { type: Number, min: 0, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', default: null, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    amount: { type: Number, min: 0, required: true },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'paid' },
    refundStatus: { type: String, enum: REFUND_STATUSES, default: 'none' },
    refundAmount: { type: Number, min: 0, default: 0 },
    date: { type: Date, required: true },
    campaign: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true, versionKey: false },
);

orderSchema.index({ date: -1 });
orderSchema.index({ productId: 1, date: -1 });
orderSchema.index({ customerId: 1, date: -1 });

export default mongoose.model('Order', orderSchema);
