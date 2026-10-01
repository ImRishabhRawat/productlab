import Experiment from '../models/Experiment.js';
import Goal from '../models/Goal.js';
import Product from '../models/Product.js';
import { badRequest, idMap } from '../utils/http.js';

export async function assertRefs({ goalId, productId, experimentId }) {
  if (goalId && !(await Goal.exists({ _id: goalId }))) throw badRequest('Goal not found', { goalId: 'Goal not found' });
  if (productId && !(await Product.exists({ _id: productId }))) throw badRequest('Product not found', { productId: 'Product not found' });
  if (experimentId && !(await Experiment.exists({ _id: experimentId }))) {
    throw badRequest('Experiment not found', { experimentId: 'Experiment not found' });
  }
}

export async function withNames(docs) {
  const [goals, products, experiments] = await Promise.all([
    Goal.find({ _id: { $in: docs.map((d) => d.goalId).filter(Boolean) } }).select('title').lean(),
    Product.find({ _id: { $in: docs.map((d) => d.productId).filter(Boolean) } }).select('name').lean(),
    Experiment.find({ _id: { $in: docs.map((d) => d.experimentId).filter(Boolean) } }).select('name').lean(),
  ]);
  const g = idMap(goals);
  const p = idMap(products);
  const x = idMap(experiments);
  return docs.map((d) => ({
    ...d,
    goalTitle: g.get(String(d.goalId))?.title ?? '',
    productName: p.get(String(d.productId))?.name ?? '',
    experimentName: x.get(String(d.experimentId))?.name ?? '',
  }));
}
