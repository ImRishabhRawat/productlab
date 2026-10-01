import Habit from '../models/Habit.js';
import HabitCompletion from '../models/HabitCompletion.js';
import { today } from '../services/settings.js';
import { badRequest, notFound } from '../utils/http.js';

export async function list(req, res) {
  const filter = req.query.all === 'true' ? {} : { archived: false };
  const items = await Habit.find(filter).sort({ archived: 1, order: 1, createdAt: 1 }).lean();
  res.json({ items });
}

export async function completions(req, res) {
  const { from, to } = req.filters;
  const filter = {};
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const items = await HabitCompletion.find(filter).select('habitId date').sort({ date: 1 }).lean();
  res.json({ items });
}

export async function create(req, res) {
  const order = req.body.order ?? (await Habit.countDocuments());
  const habit = await Habit.create({ ...req.body, order });
  res.status(201).json(habit);
}

export async function update(req, res) {
  const habit = await Habit.findByIdAndUpdate(req.params.id, { $set: req.body }, { returnDocument: 'after', runValidators: true }).lean();
  if (!habit) throw notFound('Habit');
  res.json(habit);
}

export async function remove(req, res) {
  const habit = await Habit.findByIdAndDelete(req.params.id);
  if (!habit) throw notFound('Habit');
  await HabitCompletion.deleteMany({ habitId: habit._id });
  res.status(204).end();
}

export async function complete(req, res) {
  if (req.params.date > (await today())) throw badRequest('Date is in the future', { date: 'Date is in the future' });
  if (!(await Habit.exists({ _id: req.params.id }))) throw notFound('Habit');
  await HabitCompletion.updateOne(
    { habitId: req.params.id, date: req.params.date },
    { $setOnInsert: { habitId: req.params.id, date: req.params.date } },
    { upsert: true },
  );
  res.status(204).end();
}

export async function uncomplete(req, res) {
  await HabitCompletion.deleteOne({ habitId: req.params.id, date: req.params.date });
  res.status(204).end();
}
