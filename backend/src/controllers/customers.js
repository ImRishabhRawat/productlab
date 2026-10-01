import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { conflict, idMap, notFound, searchRegex, sortSpec } from '../utils/http.js';

const SORTS = ['createdAt', 'name', 'email', 'totalSpent', 'orderCount', 'lastPurchaseAt', 'firstPurchaseAt'];

export async function list(req, res) {
  const { q, productId, sort, limit = 50, offset = 0 } = req.filters;
  const filter = {};
  if (productId) filter.productIds = productId;
  if (q) {
    const rx = searchRegex(q);
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    Customer.find(filter).sort(sortSpec(sort, SORTS, { lastPurchaseAt: -1 })).skip(offset).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);
  const products = idMap(await Product.find({ _id: { $in: items.flatMap((c) => c.productIds) } }).select('name').lean());
  res.json({
    items: items.map((c) => ({
      ...c,
      products: c.productIds.map((id) => ({ _id: id, name: products.get(String(id))?.name ?? '' })),
    })),
    total,
  });
}

export async function get(req, res) {
  const customer = await Customer.findById(req.params.id).lean();
  if (!customer) throw notFound('Customer');
  const orders = await Order.find({ customerId: customer._id }).sort({ date: -1 }).limit(200).lean();
  const products = idMap(
    await Product.find({ _id: { $in: [...customer.productIds, ...orders.map((o) => o.productId)] } })
      .select('name')
      .lean(),
  );
  res.json({
    ...customer,
    products: customer.productIds.map((id) => ({ _id: id, name: products.get(String(id))?.name ?? '' })),
    orders: orders.map((o) => ({ ...o, productName: products.get(String(o.productId))?.name ?? '' })),
  });
}

export async function create(req, res) {
  const customer = await Customer.create(req.body);
  res.status(201).json(customer);
}

export async function update(req, res) {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw notFound('Customer');
  customer.set(req.body);
  await customer.save();
  res.json(customer);
}

export async function remove(req, res) {
  if (await Order.exists({ customerId: req.params.id })) throw conflict('Customers with orders are kept for history.');
  const customer = await Customer.findByIdAndDelete(req.params.id);
  if (!customer) throw notFound('Customer');
  res.status(204).end();
}
