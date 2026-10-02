import { deriveMetrics, variableCosts } from '@product-lab/shared/metrics';
import AdCreative from '../models/AdCreative.js';
import CampaignMetric from '../models/CampaignMetric.js';
import Experiment from '../models/Experiment.js';
import Product from '../models/Product.js';
import { metricAlerts } from '../services/alerts.js';
import { alertFailed, importMetrics, resolveRefs } from '../services/metrics.js';
import { idMap, notFound } from '../utils/http.js';
import { serial } from '../utils/serial.js';

export async function list(req, res) {
  const { productId, experimentId, creativeId, campaign, from, to, limit = 100, offset = 0 } = req.filters;
  const filter = {};
  if (productId) filter.productId = productId;
  if (experimentId) filter.experimentId = experimentId;
  if (creativeId) filter.creativeId = creativeId;
  if (campaign) filter.campaign = campaign;
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  const [rows, total] = await Promise.all([
    CampaignMetric.find(filter).sort({ date: -1, createdAt: -1, _id: -1 }).skip(offset).limit(limit).lean(),
    CampaignMetric.countDocuments(filter),
  ]);
  const [products, experiments, creatives] = await Promise.all([
    Product.find({ _id: { $in: rows.map((r) => r.productId) } }).select('name costs').lean(),
    Experiment.find({ _id: { $in: rows.map((r) => r.experimentId).filter(Boolean) } }).select('name').lean(),
    AdCreative.find({ _id: { $in: rows.map((r) => r.creativeId).filter(Boolean) } }).select('name').lean(),
  ]);
  const p = idMap(products);
  const x = idMap(experiments);
  const c = idMap(creatives);
  const items = rows.map((r) => {
    const product = p.get(String(r.productId));
    return {
      ...r,
      productName: product?.name ?? '',
      experimentName: x.get(String(r.experimentId))?.name ?? '',
      creativeName: c.get(String(r.creativeId))?.name ?? '',
      derived: deriveMetrics({ ...r, ...variableCosts(r, product?.costs) }),
    };
  });
  res.json({ items, total });
}

export async function create(req, res) {
  const refs = await resolveRefs(req.body);
  const metric = await CampaignMetric.create({ ...req.body, ...refs });
  await metricAlerts(metric).catch(alertFailed);
  res.status(201).json(metric);
}

export async function update(req, res) {
  const metric = await CampaignMetric.findById(req.params.id);
  if (!metric) throw notFound('Metric entry');
  const before = metric.purchases;
  metric.set(req.body);
  await metric.save();
  await metricAlerts(metric, metric.purchases - before).catch(alertFailed);
  res.json(metric);
}

export async function remove(req, res) {
  const metric = await CampaignMetric.findByIdAndDelete(req.params.id);
  if (!metric) throw notFound('Metric entry');
  res.status(204).end();
}

export async function importRows(req, res) {
  res.json(await serial(req.body.productId, () => importMetrics(req.body)));
}
