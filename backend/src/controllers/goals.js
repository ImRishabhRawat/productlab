import { goalProductsError } from '@product-lab/shared/schemas';
import DailyOutcome from '../models/DailyOutcome.js';
import FocusSession from '../models/FocusSession.js';
import Goal from '../models/Goal.js';
import Product from '../models/Product.js';
import TimeBlock from '../models/TimeBlock.js';
import { goalAlerts } from '../services/alerts.js';
import { goalValues } from '../services/productivity.js';
import { badRequest, idMap, notFound } from '../utils/http.js';

const ORDER = { active: 0, paused: 1, achieved: 2, dropped: 3 };
const TARGET_FIELDS = ['targetValue', 'tracking', 'productIds', 'startDate', 'targetDate'];

async function checked(id) {
  await goalAlerts({ _id: id }).catch((err) => console.error(`Goal alert failed: ${err.message}`));
  return Goal.findById(id).lean();
}

async function assertProducts(ids) {
  if (!ids?.length) return;
  if ((await Product.countDocuments({ _id: { $in: ids } })) !== new Set(ids.map(String)).size) {
    throw badRequest('Unknown product', { productIds: 'Choose existing products' });
  }
}

function assertDates({ startDate, targetDate }) {
  if (startDate && targetDate && targetDate < startDate) {
    throw badRequest('Target date is before start date', { targetDate: 'Target date is before start date' });
  }
}

async function present(goals) {
  const valued = await goalValues(goals);
  const products = idMap(await Product.find({ _id: { $in: goals.flatMap((g) => g.productIds) } }).select('name status').lean());
  return valued.map((g) => ({ ...g, products: g.productIds.map((id) => products.get(String(id))).filter(Boolean) }));
}

export async function list(req, res) {
  const { status, level, category } = req.filters;
  const filter = {};
  if (status) filter.status = status;
  if (level) filter.level = level;
  if (category) filter.category = category;
  const goals = await Goal.find(filter).lean();
  goals.sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.targetDate ?? '9999').localeCompare(String(b.targetDate ?? '9999')));
  res.json({ items: await present(goals) });
}

export async function get(req, res) {
  const goal = await Goal.findById(req.params.id).lean();
  if (!goal) throw notFound('Goal');
  const [item] = await present([goal]);
  res.json(item);
}

export async function create(req, res) {
  await assertProducts(req.body.productIds);
  assertDates(req.body);
  const goal = await Goal.create({ ...req.body, achievedAt: req.body.status === 'achieved' ? new Date() : null });
  const [item] = await present([await checked(goal._id)]);
  res.status(201).json(item);
}

export async function update(req, res) {
  const goal = await Goal.findById(req.params.id);
  if (!goal) throw notFound('Goal');
  await assertProducts(req.body.productIds);
  const merged = { ...goal.toObject(), ...req.body };
  assertDates(merged);
  const linkError = goalProductsError(merged);
  if (linkError) throw badRequest(linkError, { productIds: linkError });
  const retargeted = TARGET_FIELDS.some((k) => k in req.body && String(req.body[k]) !== String(goal[k]));
  if (req.body.status && req.body.status !== goal.status) goal.achievedAt = req.body.status === 'achieved' ? new Date() : null;
  else if (retargeted && goal.status === 'active') goal.achievedAt = null;
  goal.set(req.body);
  await goal.save();
  const [item] = await present([await checked(goal._id)]);
  res.json(item);
}

export async function remove(req, res) {
  const goal = await Goal.findByIdAndDelete(req.params.id);
  if (!goal) throw notFound('Goal');
  await Promise.all(
    [TimeBlock, FocusSession, DailyOutcome].map((Model) => Model.updateMany({ goalId: goal._id }, { $set: { goalId: null } })),
  );
  res.status(204).end();
}
