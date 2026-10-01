import mongoose from 'mongoose';
import { PRODUCT_STATUSES } from '@product-lab/shared/constants';

const { Schema } = mongoose;
const str = { type: String, trim: true, default: '' };

const eventSchema = new Schema({
  date: { type: String, required: true },
  at: { type: Date, default: Date.now },
  type: { type: String, enum: ['created', 'status', 'price', 'version', 'milestone'], required: true },
  title: { type: String, required: true },
  note: str,
  from: { type: Schema.Types.Mixed, default: null },
  to: { type: Schema.Types.Mixed, default: null },
});

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: str,
    description: str,
    format: str,
    deliverable: str,
    targetCustomer: str,
    price: { type: Number, min: 0, required: true },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'ready_to_test', index: true },
    version: { type: String, default: 'v1' },
    ideaId: { type: Schema.Types.ObjectId, ref: 'ProductIdea', default: null },
    costs: {
      paymentFeePct: { type: Number, min: 0, max: 100, default: 0 },
      refundRatePct: { type: Number, min: 0, max: 100, default: 0 },
      variableCostPerSale: { type: Number, min: 0, default: 0 },
    },
    desiredMarginPct: { type: Number, min: 0, max: 100, default: 20 },
    budget: {
      daily: { type: Number, min: 0, default: null },
      monthly: { type: Number, min: 0, default: null },
    },
    statusChangedAt: { type: Date, default: Date.now },
    killedAt: { type: Date, default: null },
    killReason: str,
    learnings: str,
    events: [eventSchema],
  },
  { timestamps: true, versionKey: false },
);

productSchema.index({ category: 1 });
productSchema.index({ createdAt: -1 });

export default mongoose.model('Product', productSchema);
