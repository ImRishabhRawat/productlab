import mongoose from 'mongoose';

const { Schema } = mongoose;

const habitCompletionSchema = new Schema(
  {
    habitId: { type: Schema.Types.ObjectId, ref: 'Habit', required: true },
    date: { type: String, required: true },
  },
  { timestamps: true, versionKey: false },
);

habitCompletionSchema.index({ habitId: 1, date: 1 }, { unique: true });
habitCompletionSchema.index({ date: 1 });

export default mongoose.model('HabitCompletion', habitCompletionSchema);
