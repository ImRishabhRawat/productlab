import AdCreative from '../models/AdCreative.js';
import CampaignMetric from '../models/CampaignMetric.js';
import Experiment from '../models/Experiment.js';
import { badRequest, conflict, notFound, searchRegex, sortSpec } from '../utils/http.js';

const SORTS = ['createdAt', 'name', 'startDate'];

export async function list(req, res) {
  const { q, productId, experimentId, sort } = req.filters;
  const filter = {};
  if (productId) filter.productId = productId;
  if (experimentId) filter.experimentId = experimentId;
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { hook: rx }, { angle: rx }, { campaign: rx }, { adSet: rx }];
  }
  const items = await AdCreative.find(filter).sort(sortSpec(sort, SORTS, { createdAt: 1 })).limit(500).lean();
  res.json({ items });
}

export async function create(req, res) {
  const experiment = await Experiment.findById(req.body.experimentId).lean();
  if (!experiment) throw badRequest('Experiment not found', { experimentId: 'Experiment not found' });
  const creative = await AdCreative.create({
    ...req.body,
    productId: experiment.productId,
    campaign: req.body.campaign || experiment.campaign,
  });
  res.status(201).json(creative);
}

export async function update(req, res) {
  const creative = await AdCreative.findById(req.params.id);
  if (!creative) throw notFound('Creative');
  const previous = creative.campaign;
  creative.set(req.body);
  await creative.save();
  if (creative.campaign !== previous) {
    const fallback = (await Experiment.findById(creative.experimentId).select('campaign').lean())?.campaign ?? '';
    await CampaignMetric.updateMany(
      { creativeId: creative._id, campaign: previous || fallback },
      { $set: { campaign: creative.campaign || fallback } },
    );
  }
  res.json(creative);
}

export async function remove(req, res) {
  if (await CampaignMetric.exists({ creativeId: req.params.id })) {
    throw conflict('This creative has recorded metrics and is kept for history.');
  }
  const creative = await AdCreative.findByIdAndDelete(req.params.id);
  if (!creative) throw notFound('Creative');
  res.status(204).end();
}
