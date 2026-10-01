import mongoose from 'mongoose';

const habitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    targetPerWeek: { type: Number, min: 1, max: 7, default: 7 },
    archived: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

habitSchema.index({ archived: 1, order: 1 });

export default mongoose.model('Habit', habitSchema);
