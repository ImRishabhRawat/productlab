import mongoose from 'mongoose';

const str = { type: String, trim: true, default: '' };

const weeklyReviewSchema = new mongoose.Schema(
  {
    weekStart: { type: String, required: true, unique: true },
    wins: str,
    lessons: str,
    nextFocus: str,
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('WeeklyReview', weeklyReviewSchema);
