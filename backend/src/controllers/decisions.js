import { DECISION_STATUS } from '@product-lab/shared/constants';
import { startOfDayIn, todayIn } from '@product-lab/shared/dates';
import Decision from '../models/Decision.js';
import Experiment from '../models/Experiment.js';
import Product from '../models/Product.js';
import { summary } from '../services/analytics.js';
import { timezone } from '../services/settings.js';
import { badRequest, idMap, notFound } from '../utils/http.js';
import { applyStatus, stopExperiments } from './products.js';

const EVIDENCE = ['purchases', 'revenue', 'spend', 'cac', 'roas', 'conversionRate', 'aov', 'ctr', 'contribution'];
const FUTURE = 'Date cannot be in the future';

async function checkDate(date) {
  const tz = await timezone();
  const today = todayIn(tz);
  if (date > today) throw badRequest(FUTURE, { date: FUTURE });
  return date < today ? startOfDayIn(date, tz) : new Date();
}

export async function list(req, res) {
  const { productId, experimentId, limit = 100 } = req.filters;
  const filter = {};
  if (productId) filter.productId = productId;
  if (experimentId) filter.experimentId = experimentId;
  const items = await Decision.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
  const [products, experiments] = await Promise.all([
    Product.find({ _id: { $in: items.map((d) => d.productId) } }).select('name').lean(),
    Experiment.find({ _id: { $in: items.map((d) => d.experimentId).filter(Boolean) } }).select('name').lean(),
  ]);
  const p = idMap(products);
  const x = idMap(experiments);
  res.json({
    items: items.map((d) => ({
      ...d,
      productName: p.get(String(d.productId))?.name ?? '',
      experimentName: x.get(String(d.experimentId))?.name ?? '',
    })),
  });
}

export async function create(req, res) {
  const { applyStatus: apply, ...body } = req.body;
  const at = await checkDate(body.date);
  const product = await Product.findById(body.productId);
  if (!product) throw badRequest('Product not found', { productId: 'Product not found' });
  if (body.experimentId) {
    const experiment = await Experiment.findById(body.experimentId).select('productId').lean();
    if (!experiment || String(experiment.productId) !== String(product._id)) {
      throw badRequest('Experiment not found for this product', { experimentId: 'Experiment not found for this product' });
    }
  }
  const totals = await summary({ productId: body.productId, experimentId: body.experimentId || undefined, to: body.date });
  const evidence = Object.fromEntries(EVIDENCE.map((k) => [k, totals[k]]));
  const target = DECISION_STATUS[body.decision];
  const statusFrom = product.status;
  let statusTo = null;
  if (apply ?? !body.experimentId) {
    statusTo = target;
    if (applyStatus(product, statusTo, { date: body.date, note: body.reason, at })) {
      if (statusTo === 'killed') {
        product.killReason = body.reason;
        if (!product.learnings && body.notes) product.learnings = body.notes;
      }
      await product.save();
      await stopExperiments({ productId: product._id }, statusTo, body.date);
    }
  }
  if (body.experimentId) await stopExperiments({ _id: body.experimentId }, target, body.date);
  const decision = await Decision.create({ ...body, experimentId: body.experimentId || null, evidence, statusFrom, statusTo });
  res.status(201).json(decision);
}

export async function update(req, res) {
  const decision = await Decision.findById(req.params.id);
  if (!decision) throw notFound('Decision');
  if (req.body.date) await checkDate(req.body.date);
  decision.set(req.body);
  await decision.save();
  res.json(decision);
}

export async function remove(req, res) {
  const decision = await Decision.findByIdAndDelete(req.params.id);
  if (!decision) throw notFound('Decision');
  res.status(204).end();
}
