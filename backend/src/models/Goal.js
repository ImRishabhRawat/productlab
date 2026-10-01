import mongoose from 'mongoose';
import { GOAL_CATEGORIES, GOAL_LEVELS, GOAL_STATUSES, GOAL_TRACKING } from '@product-lab/shared/constants';

const { Schema } = mongoose;
const str = { type: String, trim: true, default: '' };

const goalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: str,
    level: { type: String, enum: GOAL_LEVELS, required: true },
    category: { type: String, enum: GOAL_CATEGORIES, required: true },
    tracking: { type: String, enum: GOAL_TRACKING, default: 'manual' },
    targetValue: { type: Number, default: null },
    currentValue: { type: Number, default: null },
    unit: str,
    startDate: { type: String, default: null },
    targetDate: { type: String, default: null },
    status: { type: String, enum: GOAL_STATUSES, default: 'active' },
    achievedAt: { type: Date, default: null },
    notes: str,
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true, versionKey: false },
);

goalSchema.index({ status: 1, level: 1 });
goalSchema.index({ productIds: 1 });

export default mongoose.model('Goal', goalSchema);
