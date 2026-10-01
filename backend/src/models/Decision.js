import mongoose from 'mongoose';
import { DECISIONS } from '@product-lab/shared/constants';

const { Schema } = mongoose;
const n = { type: Number, default: null };

const decisionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', default: null, index: true },
    decision: { type: String, enum: DECISIONS, required: true },
    reason: { type: String, trim: true, required: true },
    notes: { type: String, trim: true, default: '' },
    date: { type: String, required: true },
    evidence: {
      purchases: n,
      revenue: n,
      spend: n,
      cac: n,
      roas: n,
      conversionRate: n,
      aov: n,
      ctr: n,
      contribution: n,
    },
    statusFrom: { type: String, default: null },
    statusTo: { type: String, default: null },
  },
  { timestamps: true, versionKey: false },
);

decisionSchema.index({ productId: 1, date: -1 });

export default mongoose.model('Decision', decisionSchema);
