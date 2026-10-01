import mongoose from 'mongoose';
import { EXPERIMENT_STATUSES } from '@product-lab/shared/constants';

const { Schema } = mongoose;
const str = { type: String, trim: true, default: '' };

const experimentSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true, trim: true },
    hypothesis: str,
    status: { type: String, enum: EXPERIMENT_STATUSES, default: 'planned', index: true },
    variables: {
      price: { type: Number, min: 0, default: null },
      offer: str,
      audience: str,
      creative: str,
      angle: str,
      landingPage: str,
      cta: str,
    },
    changeNote: str,
    budget: { type: Number, min: 0, default: null },
    dailyBudget: { type: Number, min: 0, default: null },
    startDate: { type: String, default: null },
    endDate: { type: String, default: null },
    campaign: str,
    notes: str,
  },
  { timestamps: true, versionKey: false },
);

experimentSchema.index({ productId: 1, createdAt: -1 });
experimentSchema.index({ campaign: 1 });

export default mongoose.model('Experiment', experimentSchema);
