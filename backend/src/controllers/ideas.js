import { IDEA_SIGNALS } from '@product-lab/shared/constants';
import { ideaScores } from '@product-lab/shared/metrics';
import Product from '../models/Product.js';
import ProductIdea from '../models/ProductIdea.js';
import { productDefaults, today } from '../services/settings.js';
import { conflict, notFound, searchRegex, sortSpec } from '../utils/http.js';

const withScores = (idea) => ({ ...idea, scores: ideaScores(idea) });
const SORTS = ['createdAt', 'updatedAt', 'name', 'expectedPrice'];

export async function list(req, res) {
  const { q, status, category, potential, difficulty, risk, sort } = req.filters;
  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { category: rx }, { targetCustomer: rx }, { problem: rx }, { format: rx }, { source: rx }];
  }
  const [docs, categories] = await Promise.all([
    ProductIdea.find(filter).select('-history').sort(sortSpec(sort, SORTS, { createdAt: -1 })).limit(500).lean(),
    ProductIdea.distinct('category'),
  ]);
  let items = docs.map(withScores);
  if (potential) items = items.filter((i) => i.scores.potentialLevel === potential);
  if (difficulty) items = items.filter((i) => i.scores.difficultyLevel === difficulty);
  if (risk) items = items.filter((i) => i.scores.riskLevel === risk);
  if (sort?.replace('-', '') === 'potential') {
    const dir = sort.startsWith('-') ? -1 : 1;
    items.sort((a, b) => dir * ((a.scores.potential ?? -1) - (b.scores.potential ?? -1)));
  }
  res.json({ items, facets: { categories: categories.filter(Boolean).sort() } });
}

export async function get(req, res) {
  const idea = await ProductIdea.findById(req.params.id).lean();
  if (!idea) throw notFound('Idea');
  const product = idea.productId ? await Product.findById(idea.productId).select('name status price').lean() : null;
  res.json({ ...withScores(idea), product });
}

export async function create(req, res) {
  const idea = await ProductIdea.create({ ...req.body, history: [{ to: req.body.status ?? 'idea' }] });
  res.status(201).json(withScores(idea.toObject()));
}

function mergeValidation(current, patch) {
  const signals = { ...current.signals };
  for (const k of IDEA_SIGNALS) if (patch.signals?.[k]) signals[k] = { ...signals[k], ...patch.signals[k] };
  return { ...current, ...patch, signals };
}

export async function update(req, res) {
  const idea = await ProductIdea.findById(req.params.id);
  if (!idea) throw notFound('Idea');
  const { validation, ...body } = req.body;
  if (idea.status === 'converted' && body.status) throw conflict('Converted ideas keep their status');
  if (body.status && body.status !== idea.status) idea.history.push({ from: idea.status, to: body.status });
  idea.set(body);
  if (validation) idea.set('validation', mergeValidation(idea.toObject().validation ?? {}, validation));
  await idea.save();
  res.json(withScores(idea.toObject()));
}

export async function remove(req, res) {
  const idea = await ProductIdea.findById(req.params.id);
  if (!idea) throw notFound('Idea');
  if (idea.status === 'converted') throw conflict('Converted ideas are part of a product history and cannot be deleted');
  await idea.deleteOne();
  res.status(204).end();
}

export async function convert(req, res) {
  const idea = await ProductIdea.findById(req.params.id);
  if (!idea) throw notFound('Idea');
  if (idea.status === 'converted') throw conflict('This idea is already a product');
  const status = req.body.status ?? 'ready_to_test';
  const product = await Product.create({
    ...(await productDefaults()),
    name: idea.name,
    category: idea.category,
    description: idea.problem,
    format: idea.format,
    deliverable: idea.deliverable,
    targetCustomer: idea.targetCustomer,
    price: req.body.price ?? idea.expectedPrice ?? 0,
    status,
    ideaId: idea._id,
    events: [{ date: await today(), type: 'created', title: 'Converted from idea', to: status }],
  });
  idea.history.push({ from: idea.status, to: 'converted' });
  idea.set({ status: 'converted', productId: product._id, convertedAt: new Date() });
  await idea.save();
  const { events, ...rest } = product.toObject();
  res.status(201).json({ product: rest, idea: withScores(idea.toObject()) });
}
