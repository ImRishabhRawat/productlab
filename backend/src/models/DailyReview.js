import mongoose from 'mongoose';

const str = { type: String, trim: true, default: '' };

const dailyReviewSchema = new mongoose.Schema(
  {
    date: { type: String, required: true, unique: true },
    outcomeCompleted: { type: Boolean, default: null },
    accomplishment: str,
    lesson: str,
    blocker: str,
    tomorrowOutcome: str,
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('DailyReview', dailyReviewSchema);
