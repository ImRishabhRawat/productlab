import { beforeEndError } from '@product-lab/shared/schemas';
import TimeBlock from '../models/TimeBlock.js';
import { snapshotSchedule } from '../services/productivity.js';
import { assertRefs } from '../services/refs.js';
import { badRequest, notFound } from '../utils/http.js';

export async function list(req, res) {
  const items = await TimeBlock.find().sort({ start: 1, name: 1 }).lean();
  res.json({ items });
}

export async function create(req, res) {
  await assertRefs(req.body);
  const block = await TimeBlock.create(req.body);
  res.status(201).json(block);
}

export async function update(req, res) {
  const block = await TimeBlock.findById(req.params.id);
  if (!block) throw notFound('Time block');
  await assertRefs(req.body);
  const { reminders, ...body } = req.body;
  block.set(body);
  if (reminders) block.set('reminders', { ...block.toObject().reminders, ...reminders });
  if (block.start === block.end) throw badRequest('End must differ from start', { end: 'End must differ from start' });
  const tooLong = beforeEndError(block);
  if (tooLong) throw badRequest('Please fix the highlighted fields', { 'reminders.beforeEnd': tooLong });
  await snapshotSchedule();
  await block.save();
  res.json(block);
}

export async function remove(req, res) {
  if (!(await TimeBlock.exists({ _id: req.params.id }))) throw notFound('Time block');
  await snapshotSchedule();
  await TimeBlock.deleteOne({ _id: req.params.id });
  res.status(204).end();
}
