import { LABELS } from '@product-lab/shared/constants';
import { isoDateIn } from '@product-lab/shared/dates';
import AdCreative from '../models/AdCreative.js';
import CampaignMetric from '../models/CampaignMetric.js';
import Decision from '../models/Decision.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ProductIdea from '../models/ProductIdea.js';
import ProductVersion from '../models/ProductVersion.js';
import { idMap } from '../utils/http.js';
import { timezone } from './settings.js';

const RANK = ['idea', 'validation', 'created', 'milestone', 'version', 'price', 'experiment', 'creative', 'purchase', 'experiment_end', 'decision', 'status'];
const rank = (type) => (RANK.includes(type) ? RANK.indexOf(type) : RANK.length);
const byDate = (a, b) => a.date.localeCompare(b.date) || rank(a.type) - rank(b.type) || new Date(a.at ?? 0) - new Date(b.at ?? 0);

export async function productTimeline(product) {
  const tz = await timezone();
  const productId = product._id;
  const [idea, versions, experiments, creatives, decisions, firstMetric, firstOrder] = await Promise.all([
    product.ideaId ? ProductIdea.findById(product.ideaId).select('createdAt history').lean() : null,
    ProductVersion.find({ productId }).lean(),
    Experiment.find({ productId }).select('name status startDate endDate createdAt').lean(),
    AdCreative.find({ productId }).select('name startDate experimentId createdAt').lean(),
    Decision.find({ productId }).lean(),
    CampaignMetric.findOne({ productId, purchases: { $gt: 0 } }).sort({ date: 1 }).select('date').lean(),
    Order.findOne({ productId, paymentStatus: 'paid' }).sort({ date: 1 }).select('date').lean(),
  ]);

  const items = [];
  if (idea) {
    items.push({ type: 'idea', date: isoDateIn(idea.createdAt, tz), at: idea.createdAt, title: 'Idea created', refId: idea._id });
    const research = idea.history?.find((h) => h.to === 'researching');
    if (research) items.push({ type: 'validation', date: isoDateIn(research.at, tz), at: research.at, title: 'Validation started' });
  }
  for (const e of product.events ?? []) {
    items.push({ _id: e._id, type: e.type, date: e.date, at: e.at, title: e.title, note: e.note, from: e.from, to: e.to });
  }
  for (const v of versions) {
    items.push({ type: 'version', date: v.date, at: v.createdAt, title: `Version ${v.label} released`, note: v.changes, refId: v._id, to: v.price });
  }
  for (const x of experiments) {
    if (x.startDate && x.status !== 'planned') {
      items.push({ type: 'experiment', date: x.startDate, at: x.createdAt, title: `Test launched: ${x.name}`, refId: x._id });
    }
    if (x.endDate && ['completed', 'stopped'].includes(x.status)) {
      items.push({ type: 'experiment_end', date: x.endDate, title: `Test ${x.status}: ${x.name}`, refId: x._id });
    }
  }
  for (const c of creatives) {
    if (c.startDate) {
      items.push({ type: 'creative', date: c.startDate, at: c.createdAt, title: `Creative launched: ${c.name}`, refId: c.experimentId });
    }
  }
  const firstPurchase = [firstMetric?.date, firstOrder && isoDateIn(firstOrder.date, tz)].filter(Boolean).sort()[0];
  if (firstPurchase) items.push({ type: 'purchase', date: firstPurchase, title: 'First purchase' });
  for (const d of decisions) {
    items.push({
      type: 'decision',
      date: d.date,
      at: d.createdAt,
      title: `Decision: ${LABELS.decision[d.decision]}`,
      note: d.reason,
      decision: d.decision,
      refId: d._id,
    });
  }
  return items.sort(byDate);
}

export async function recentActivity(limit = 12) {
  const tz = await timezone();
  const [events, experiments, decisions, versions, creatives, ideas] = await Promise.all([
    Product.aggregate([
      { $unwind: '$events' },
      { $sort: { 'events.at': -1 } },
      { $limit: limit },
      { $project: { _id: 0, productId: '$_id', event: '$events' } },
    ]),
    Experiment.find().sort({ createdAt: -1 }).limit(limit).select('name productId createdAt').lean(),
    Decision.find().sort({ createdAt: -1 }).limit(limit).select('decision reason productId createdAt date').lean(),
    ProductVersion.find().sort({ createdAt: -1 }).limit(limit).select('label productId createdAt date').lean(),
    AdCreative.find().sort({ createdAt: -1 }).limit(limit).select('name productId experimentId createdAt').lean(),
    ProductIdea.find().sort({ createdAt: -1 }).limit(limit).select('name createdAt').lean(),
  ]);

  const items = [
    ...events.map(({ productId, event: e }) => ({
      type: e.type,
      at: e.at,
      date: e.date,
      title: e.title,
      from: e.from,
      to: e.to,
      productId,
    })),
    ...experiments.map((x) => ({ type: 'experiment', at: x.createdAt, title: `Experiment created: ${x.name}`, productId: x.productId, refId: x._id })),
    ...decisions.map((d) => ({
      type: 'decision',
      at: d.createdAt,
      date: d.date,
      title: `Decision: ${LABELS.decision[d.decision]}`,
      note: d.reason,
      decision: d.decision,
      productId: d.productId,
      refId: d._id,
    })),
    ...versions.map((v) => ({ type: 'version', at: v.createdAt, date: v.date, title: `Version ${v.label} released`, productId: v.productId })),
    ...creatives.map((c) => ({ type: 'creative', at: c.createdAt, title: `Creative added: ${c.name}`, productId: c.productId, refId: c.experimentId })),
    ...ideas.map((i) => ({ type: 'idea', at: i.createdAt, title: `Idea captured: ${i.name}`, refId: i._id })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, limit);

  const products = idMap(
    await Product.find({ _id: { $in: [...new Set(items.filter((i) => i.productId).map((i) => String(i.productId)))] } })
      .select('name status')
      .lean(),
  );
  return items.map((i) => ({
    ...i,
    date: i.date ?? isoDateIn(i.at, tz),
    productName: i.productId ? (products.get(String(i.productId))?.name ?? '') : '',
  }));
}
