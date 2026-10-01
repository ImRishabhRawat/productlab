import DailyOutcome from '../models/DailyOutcome.js';
import { assertRefs } from '../services/refs.js';

export async function list(req, res) {
  const { from, to } = req.filters;
  const filter = {};
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const items = await DailyOutcome.find(filter).sort({ date: -1 }).limit(400).lean();
  res.json({ items });
}

export async function get(req, res) {
  const outcome = await DailyOutcome.findOne({ date: req.params.date }).lean();
  res.json(outcome ?? { date: req.params.date, title: '', done: false, tasks: [], completedBlocks: [] });
}

export async function put(req, res) {
  const { date } = req.params;
  await assertRefs(req.body);
  const current = await DailyOutcome.findOne({ date }).lean();
  const update = { ...req.body };
  if ('done' in update) update.doneAt = update.done ? (current?.doneAt ?? new Date()) : null;
  const outcome = await DailyOutcome.findOneAndUpdate(
    { date },
    { $set: update, $setOnInsert: { date } },
    { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
  ).lean();
  res.json(outcome);
}
