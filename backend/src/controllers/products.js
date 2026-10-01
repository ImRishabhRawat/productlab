import { LABELS } from '@product-lab/shared/constants';
import Experiment from '../models/Experiment.js';
import Product from '../models/Product.js';
import ProductIdea from '../models/ProductIdea.js';
import ProductVersion from '../models/ProductVersion.js';
import { productDefaults, today } from '../services/settings.js';
import { productTimeline } from '../services/timeline.js';
import { notFound, searchRegex, sortSpec } from '../utils/http.js';

const SORTS = ['createdAt', 'updatedAt', 'name', 'price', 'statusChangedAt'];
const STOPPED_BY = { killed: ['planned', 'running'], paused: ['running'] };

const withoutEvents = (product) => {
  const { events, ...rest } = product.toObject ? product.toObject() : product;
  return rest;
};

async function findProduct(id) {
  const product = await Product.findById(id);
  if (!product) throw notFound('Product');
  return product;
}

export function applyStatus(product, status, { date, note = '', at = new Date() }) {
  if (!status || status === product.status) return false;
  product.events.push({
    date,
    type: 'status',
    title: `${LABELS.status[product.status]} → ${LABELS.status[status]}`,
    from: product.status,
    to: status,
    note,
  });
  product.status = status;
  product.statusChangedAt = at;
  product.killedAt = status === 'killed' ? at : null;
  return true;
}

export async function stopExperiments(filter, status, date) {
  if (!STOPPED_BY[status]) return;
  const open = { ...filter, status: { $in: STOPPED_BY[status] } };
  await Experiment.updateMany(
    { ...open, endDate: null, $or: [{ startDate: null }, { startDate: { $lte: date } }] },
    { $set: { endDate: date } },
  );
  await Experiment.updateMany(open, { $set: { status: 'stopped' } });
}

export async function list(req, res) {
  const { q, status, category, sort } = req.filters;
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { category: rx }, { description: rx }, { targetCustomer: rx }];
  }
  const [items, categories] = await Promise.all([
    Product.find(filter).select('-events').sort(sortSpec(sort, SORTS, { createdAt: -1 })).limit(500).lean(),
    Product.distinct('category'),
  ]);
  res.json({ items, facets: { categories: categories.filter(Boolean).sort() } });
}

export async function get(req, res) {
  const product = await Product.findById(req.params.id).select('-events').lean();
  if (!product) throw notFound('Product');
  const idea = product.ideaId ? await ProductIdea.findById(product.ideaId).select('name status createdAt').lean() : null;
  res.json({ ...product, idea });
}

export async function create(req, res) {
  const { statusNote, costs, ...body } = req.body;
  const defaults = await productDefaults();
  const status = body.status ?? 'ready_to_test';
  const product = await Product.create({
    ...body,
    costs: { ...defaults.costs, ...costs },
    desiredMarginPct: body.desiredMarginPct ?? defaults.desiredMarginPct,
    killedAt: status === 'killed' ? new Date() : null,
    events: [{ date: await today(), type: 'created', title: 'Product created', to: status, note: statusNote ?? '' }],
  });
  res.status(201).json(withoutEvents(product));
}

export async function update(req, res) {
  const product = await findProduct(req.params.id);
  const { statusNote, status, costs, budget, ...body } = req.body;
  const date = await today();
  const changed = applyStatus(product, status, { date, note: statusNote });
  if (body.price != null && body.price !== product.price) {
    product.events.push({ date, type: 'price', title: 'Price changed', from: product.price, to: body.price });
  }
  if (body.version && body.version !== product.version) {
    product.events.push({ date, type: 'version', title: `Version set to ${body.version}`, from: product.version, to: body.version });
  }
  const current = product.toObject();
  product.set(body);
  if (costs) product.set('costs', { ...current.costs, ...costs });
  if (budget) product.set('budget', { ...current.budget, ...budget });
  await product.save();
  if (changed) await stopExperiments({ productId: product._id }, status, date);
  res.json(withoutEvents(product));
}

export async function timeline(req, res) {
  const product = await Product.findById(req.params.id).lean();
  if (!product) throw notFound('Product');
  res.json({ items: await productTimeline(product) });
}

export async function addEvent(req, res) {
  const product = await findProduct(req.params.id);
  product.events.push({ ...req.body, type: 'milestone' });
  await product.save();
  res.status(201).json(product.events.at(-1));
}

export async function removeEvent(req, res) {
  const product = await findProduct(req.params.id);
  const event = product.events.id(req.params.eventId);
  if (!event || event.type !== 'milestone') throw notFound('Milestone');
  event.deleteOne();
  await product.save();
  res.status(204).end();
}

export async function listVersions(req, res) {
  const items = await ProductVersion.find({ productId: req.params.id }).sort({ date: -1, createdAt: -1 }).lean();
  res.json({ items });
}

export async function addVersion(req, res) {
  const product = await findProduct(req.params.id);
  const version = await ProductVersion.create({ ...req.body, productId: product._id });
  product.version = version.label;
  if (req.body.price != null && req.body.price !== product.price) {
    product.events.push({ date: version.date, type: 'price', title: 'Price changed', from: product.price, to: req.body.price });
    product.price = req.body.price;
  }
  await product.save();
  res.status(201).json(version);
}

export async function removeVersion(req, res) {
  const version = await ProductVersion.findOneAndDelete({ _id: req.params.versionId, productId: req.params.id });
  if (!version) throw notFound('Version');
  res.status(204).end();
}
