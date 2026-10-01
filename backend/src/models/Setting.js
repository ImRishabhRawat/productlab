import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'app', unique: true },
    currency: { type: String, default: 'INR' },
    locale: { type: String, default: 'en-IN' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    defaultPaymentFeePct: { type: Number, min: 0, max: 100, default: 2.5 },
    defaultRefundRatePct: { type: Number, min: 0, max: 100, default: 0 },
    defaultVariableCostPerSale: { type: Number, min: 0, default: 0 },
    defaultDesiredMarginPct: { type: Number, min: 0, max: 100, default: 20 },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('Setting', settingSchema);
