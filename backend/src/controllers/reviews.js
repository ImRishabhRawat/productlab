import { addDays, bucketStart } from '@product-lab/shared/dates';
import DailyOutcome from '../models/DailyOutcome.js';
import DailyReview from '../models/DailyReview.js';
import WeeklyReview from '../models/WeeklyReview.js';
import { weekReview } from '../services/productivity.js';
import { badRequest } from '../utils/http.js';

const upsert = (Model, filter, body) =>
  Model.findOneAndUpdate(filter, { $set: body, $setOnInsert: filter }, { upsert: true, returnDocument: 'after', runValidators: true }).lean();

export async function listDaily(req, res) {
  const { from, to } = req.filters;
  const filter = {};
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  res.json({ items: await DailyReview.find(filter).sort({ date: -1 }).limit(400).lean() });
}

export async function getDaily(req, res) {
  res.json((await DailyReview.findOne({ date: req.params.date }).lean()) ?? null);
}

export async function putDaily(req, res) {
  const { date } = req.params;
  const review = await upsert(DailyReview, { date }, req.body);
  const done = req.body.outcomeCompleted;
  if (typeof done === 'boolean') {
    await DailyOutcome.updateOne({ date, title: { $ne: '' }, done: !done }, { $set: { done, doneAt: done ? new Date() : null } });
  }
  if (req.body.tomorrowOutcome) await upsert(DailyOutcome, { date: addDays(date, 1) }, { title: req.body.tomorrowOutcome });
  res.json(review);
}

export async function getWeekly(req, res) {
  res.json(await weekReview(req.filters.start));
}

export async function putWeekly(req, res) {
  const { weekStart } = req.params;
  if (bucketStart(weekStart, 'week') !== weekStart) throw badRequest('Weeks start on Monday', { weekStart: 'Weeks start on Monday' });
  res.json(await upsert(WeeklyReview, { weekStart }, req.body));
}
