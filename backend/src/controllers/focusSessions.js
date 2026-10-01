import { FOCUS_MAX_MINUTES } from '@product-lab/shared/constants';
import { addDays, startOfDayIn } from '@product-lab/shared/dates';
import FocusSession from '../models/FocusSession.js';
import { assertRefs, withNames } from '../services/refs.js';
import { timezone } from '../services/settings.js';
import { conflict, notFound } from '../utils/http.js';

export async function list(req, res) {
  const { from, to, status, goalId, productId, limit = 100 } = req.filters;
  const tz = await timezone();
  const filter = {};
  if (status) filter.status = { $in: status.split(',') };
  if (goalId) filter.goalId = goalId;
  if (productId) filter.productId = productId;
  if (from || to) {
    filter.startedAt = {};
    if (from) filter.startedAt.$gte = startOfDayIn(from, tz);
    if (to) filter.startedAt.$lt = startOfDayIn(addDays(to, 1), tz);
  }
  const items = await FocusSession.find(filter).sort({ startedAt: -1 }).limit(limit).lean();
  res.json({ items: await withNames(items) });
}

export async function start(req, res) {
  const running = await FocusSession.findOne({ status: 'running' }).lean();
  if (running) throw conflict('A focus session is already running');
  await assertRefs(req.body);
  const session = await FocusSession.create({ ...req.body, startedAt: new Date(), status: 'running' }).catch((err) => {
    throw err.code === 11000 ? conflict('A focus session is already running') : err;
  });
  const [item] = await withNames([session.toObject()]);
  res.status(201).json(item);
}

export async function update(req, res) {
  const session = await FocusSession.findById(req.params.id);
  if (!session) throw notFound('Focus session');
  const { status, ...body } = req.body;
  await assertRefs(body);
  session.set(body);
  if (status && session.status === 'running') {
    const now = new Date();
    const elapsed = Math.round((now - session.startedAt) / 60000);
    session.set({ status, endedAt: now, minutes: Math.min(Math.max(elapsed, 0), FOCUS_MAX_MINUTES) });
  } else if (status && status !== session.status) {
    throw conflict('Only a running session can be completed or cancelled');
  }
  await session.save();
  const [item] = await withNames([session.toObject()]);
  res.json(item);
}

export async function remove(req, res) {
  const session = await FocusSession.findByIdAndDelete(req.params.id);
  if (!session) throw notFound('Focus session');
  res.status(204).end();
}
