import mongoose from 'mongoose';

const on = { type: Boolean, default: true };
const off = { type: Boolean, default: false };
const at = (time) => ({ type: String, default: time });

const notificationPreferenceSchema = new mongoose.Schema(
  {
    owner: { type: String, required: true, unique: true, lowercase: true, trim: true },
    enabled: on,
    blockReminder: on,
    blockStart: on,
    blockEnd: on,
    dailyOutcome: on,
    dailyOutcomeTime: at('08:00'),
    dailyReview: on,
    dailyReviewTime: at('22:00'),
    weeklyReview: on,
    weeklyReviewDay: { type: Number, min: 0, max: 6, default: 0 },
    weeklyReviewTime: at('19:00'),
    habitReminders: off,
    habitReminderTime: at('20:00'),
    focusEnd: on,
    quietHours: on,
    quietStart: at('23:00'),
    quietEnd: at('06:00'),
    business: {
      newOrder: off,
      refund: off,
      conversionDrop: off,
      experimentMilestone: off,
      goalReached: off,
      dailyRevenue: off,
      dailyRevenueTime: at('21:30'),
      adSpendThreshold: off,
    },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model('NotificationPreference', notificationPreferenceSchema);
