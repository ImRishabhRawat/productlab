import mongoose from 'mongoose';

const { Schema } = mongoose;

const dailyOutcomeSchema = new Schema(
  {
    date: { type: String, required: true, unique: true },
    title: { type: String, trim: true, default: '' },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    experimentId: { type: Schema.Types.ObjectId, ref: 'Experiment', default: null },
    tasks: [{ title: { type: String, trim: true, required: true }, done: { type: Boolean, default: false } }],
    completedBlocks: [{ type: Schema.Types.ObjectId, ref: 'TimeBlock' }],
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('DailyOutcome', dailyOutcomeSchema);
