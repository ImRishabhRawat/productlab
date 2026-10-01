import { clockIn, timeToMinutes } from '@product-lab/shared/dates';
import { config } from '../config.js';
import Notification from '../models/Notification.js';
import NotificationPreference from '../models/NotificationPreference.js';
import { sendPush } from './push.js';
import { timezone } from './settings.js';

const PREFERENCE = {
  block_reminder: 'blockReminder',
  block_start: 'blockStart',
  block_end: 'blockEnd',
  daily_outcome: 'dailyOutcome',
  daily_review: 'dailyReview',
  tomorrow_outcome: 'dailyReview',
  weekly_review: 'weeklyReview',
  habit_reminder: 'habitReminders',
  focus_end: 'focusEnd',
  new_order: 'business.newOrder',
  refund: 'business.refund',
  conversion_drop: 'business.conversionDrop',
  experiment_milestone: 'business.experimentMilestone',
  goal_reached: 'business.goalReached',
  daily_revenue: 'business.dailyRevenue',
  ad_spend: 'business.adSpendThreshold',
};

export const owner = () => config.adminEmail;

export const unreadCount = (email) => Notification.countDocuments({ owner: email, readAt: null });

export async function preferences(email = owner()) {
  return (
    (await NotificationPreference.findOne({ owner: email }).lean()) ??
    NotificationPreference.findOneAndUpdate(
      { owner: email },
      { $setOnInsert: { owner: email } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean()
  );
}

export function allows(prefs, type) {
  if (!prefs.enabled) return false;
  const path = PREFERENCE[type];
  return !path || path.split('.').reduce((o, k) => o?.[k], prefs) !== false;
}

export function inQuietHours(prefs, minutes) {
  if (!prefs.quietHours) return false;
  const start = timeToMinutes(prefs.quietStart);
  const end = timeToMinutes(prefs.quietEnd);
  if (start === end) return false;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export async function notify({
  category,
  type,
  title,
  body = '',
  url = '/',
  dedupeKey = null,
  urgency = 'normal',
  ttl,
  background = false,
  prefs,
  now = new Date(),
}) {
  const email = owner();
  const settings = prefs ?? (await preferences(email));
  if (!allows(settings, type)) return null;
  let doc;
  try {
    doc = await Notification.create({ owner: email, category, type, title, body, url, dedupeKey });
  } catch (err) {
    if (err.code === 11000) return null;
    throw err;
  }
  const delivery = (async () => {
    const quiet = type !== 'test' && inQuietHours(settings, clockIn(now, await timezone()).minutes);
    const pushed = quiet
      ? { sent: 0, failed: 0, skipped: 'quiet_hours' }
      : await sendPush(
          email,
          { id: String(doc._id), title, body, url, category, tag: dedupeKey ?? String(doc._id), unread: await unreadCount(email) },
          { urgency, ttl },
        );
    await Notification.updateOne({ _id: doc._id }, { $set: { pushed } });
    return pushed;
  })();
  if (background) {
    delivery.catch((err) => console.error(`Push failed: ${err.message}`));
    return doc.toObject();
  }
  return { ...doc.toObject(), pushed: await delivery };
}
