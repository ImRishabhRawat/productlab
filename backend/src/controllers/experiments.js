import AdCreative from '../models/AdCreative.js';
import CampaignMetric from '../models/CampaignMetric.js';
import Decision from '../models/Decision.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { badRequest, conflict, idMap, notFound, searchRegex, sortSpec } from '../utils/http.js';

const SORTS = ['createdAt', 'updatedAt', 'name', 'startDate', 'status'];

function assertDates({ startDate, endDate }) {
  if (startDate && endDate && endDate < startDate) throw badRequest('End date is before start date', { endDate: 'End date is before start date' });
}

export async function list(req, res) {
  const { q, productId, status, campaign, sort } = req.filters;
  const filter = {};
  if (productId) filter.productId = productId;
  if (status) filter.status = status;
  if (campaign) filter.campaign = campaign;
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [
      { name: rx },
      { hypothesis: rx },
      { campaign: rx },
      { 'variables.offer': rx },
      { 'variables.audience': rx },
      { 'variables.angle': rx },
      { 'variables.creative': rx },
    ];
  }
  const [items, campaigns] = await Promise.all([
    Experiment.find(filter).sort(sortSpec(sort, SORTS, { createdAt: -1 })).limit(500).lean(),
    Experiment.distinct('campaign', productId ? { productId } : {}),
  ]);
  const products = idMap(await Product.find({ _id: { $in: items.map((x) => x.productId) } }).select('name status').lean());
  res.json({
    items: items.map((x) => ({ ...x, productName: products.get(String(x.productId))?.name ?? '' })),
    facets: { campaigns: campaigns.filter(Boolean).sort() },
  });
}

export async function get(req, res) {
  const experiment = await Experiment.findById(req.params.id).lean();
  if (!experiment) throw notFound('Experiment');
  const product = await Product.findById(experiment.productId)
    .select('name status price category costs desiredMarginPct version')
    .lean();
  res.json({ ...experiment, product });
}

export async function create(req, res) {
  if (!(await Product.exists({ _id: req.body.productId }))) throw badRequest('Product not found', { productId: 'Product not found' });
  assertDates(req.body);
  const experiment = await Experiment.create(req.body);
  res.status(201).json(experiment);
}

export async function update(req, res) {
  const experiment = await Experiment.findById(req.params.id);
  if (!experiment) throw notFound('Experiment');
  const { variables, ...body } = req.body;
  const current = experiment.toObject();
  assertDates({
    startDate: 'startDate' in body ? body.startDate : current.startDate,
    endDate: 'endDate' in body ? body.endDate : current.endDate,
  });
  experiment.set(body);
  if (variables) experiment.set('variables', { ...current.variables, ...variables });
  await experiment.save();
  if (experiment.campaign !== current.campaign) {
    const renamed = { experimentId: experiment._id, campaign: current.campaign };
    const rename = { $set: { campaign: experiment.campaign } };
    await Promise.all([AdCreative, CampaignMetric, Order].map((model) => model.updateMany(renamed, rename)));
  }
  res.json(experiment);
}

export async function remove(req, res) {
  const id = req.params.id;
  const [metrics, decisions, orders] = await Promise.all([
    CampaignMetric.exists({ experimentId: id }),
    Decision.exists({ experimentId: id }),
    Order.exists({ experimentId: id }),
  ]);
  if (metrics || decisions || orders) throw conflict('This experiment has recorded results. Stop it instead of deleting it.');
  const experiment = await Experiment.findByIdAndDelete(id);
  if (!experiment) throw notFound('Experiment');
  await AdCreative.deleteMany({ experimentId: id });
  res.status(204).end();
}
