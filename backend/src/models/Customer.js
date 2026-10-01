import mongoose from 'mongoose';

const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    phone: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    totalSpent: { type: Number, default: 0 },
    orderCount: { type: Number, default: 0 },
    firstPurchaseAt: { type: Date, default: null },
    lastPurchaseAt: { type: Date, default: null },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true, versionKey: false },
);

customerSchema.index({ totalSpent: -1 });
customerSchema.index({ lastPurchaseAt: -1 });
customerSchema.index({ productIds: 1 });

export default mongoose.model('Customer', customerSchema);
