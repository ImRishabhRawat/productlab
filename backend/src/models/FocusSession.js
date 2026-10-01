import mongoose from 'mongoose';
import { BLOCK_CATEGORIES, FOCUS_STATUSES } from '@product-lab/shared/constants';

const { Schema } = mongoose;

const focusSessionSchema = new Schema(
  {
    label: { type: String, trim: true, default: '' },
    category: { type: String, enum: BLOCK_CATEGORIES, default: 'business' },
    plannedMinutes: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date, default: null },
    minutes: { type: Number, default: 0 },
    status: { type: String, enum: FOCUS_STATUSES, default: 'running' },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', default: null },
    notes: { type: String, trim: true, default: '' },
    endNotified: { type: Boolean, default: false },
  },
  { timestamps: true, versionKey: false },
);

focusSessionSchema.index({ startedAt: -1 });
focusSessionSchema.index({ status: 1 });
focusSessionSchema.index({ status: 1 }, { name: 'one_running', unique: true, partialFilterExpression: { status: 'running' } });
focusSessionSchema.index({ goalId: 1, startedAt: -1 });
focusSessionSchema.index({ productId: 1, startedAt: -1 });

export default mongoose.model('FocusSession', focusSessionSchema);
