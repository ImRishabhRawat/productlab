import mongoose from 'mongoose';
import { BLOCK_CATEGORIES } from '@product-lab/shared/constants';
import { TIME_RE } from '@product-lab/shared/dates';

const { Schema } = mongoose;

const timeBlockSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    start: { type: String, required: true, match: TIME_RE },
    end: { type: String, required: true, match: TIME_RE },
    days: { type: [Number], default: () => [0, 1, 2, 3, 4, 5, 6] },
    category: { type: String, enum: BLOCK_CATEGORIES, default: 'other' },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    enabled: { type: Boolean, default: true },
    reminders: {
      beforeStart: { type: Number, default: 5 },
      atStart: { type: Boolean, default: true },
      beforeEnd: { type: Number, default: null },
    },
  },
  { timestamps: true, versionKey: false },
);

timeBlockSchema.index({ enabled: 1, start: 1 });

export default mongoose.model('TimeBlock', timeBlockSchema);
