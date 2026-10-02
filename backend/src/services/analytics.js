import mongoose from 'mongoose';
import { METRIC_FIELDS, ORDER_ITEM_KINDS, PRODUCT_STATUSES } from '@product-lab/shared/constants';
import {
  addTotals,
  compareMetrics,
  deriveMetrics,
  emptyTotals,
  percent,
  ratio,
  round,
  sumTotals,
  variableCosts,
} from '@product-lab/shared/metrics';
import {
  addDays,
  autoGranularity,
  fitGranularity,
  bucketRange,
  bucketStart,
  isoDateIn,
  previousRange,
  startOfDayIn,
  todayIn,
} from '@product-lab/shared/dates';
import AdCreative from '../models/AdCreative.js';
import CampaignMetric from '../models/CampaignMetric.js';
import Customer from '../models/Customer.js';
import Decision from '../models/Decision.js';
import Experiment from '../models/Experiment.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ProductIdea from '../models/ProductIdea.js';
import { idMap } from '../utils/http.js';
import { getSettings } from './settings.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));
const inIds = (ids) => ({ $in: ids.map(oid) });
const uniqueIds = (values) => [...new Set(values.map(String))];

function metricMatch(f = {}) {
  const m = {};
  if (f.from || f.to) m.date = { ...(f.from && { $gte: f.from }), ...(f.to && { $lte: f.to }) };
  if (f.productId) m.productId = oid(f.productId);
  if (f.productIds) m.productId = inIds(f.productIds);
  if (f.experimentId) m.experimentId = oid(f.experimentId);
  if (f.experimentIds) m.experimentId = inIds(f.experimentIds);
  if (f.creativeId) m.creativeId = oid(f.creativeId);
  if (f.creativeIds) m.creativeId = inIds(f.creativeIds);
  if (f.campaign) m.campaign = f.campaign;
  return m;
}

const AD_SCOPES = ['experimentId', 'experimentIds', 'creativeId', 'creativeIds', 'campaign'];
const adScoped = (filter, keys = []) => AD_SCOPES.some((k) => filter[k]) || keys.some((k) => k !== 'date');

function productScope(f) {
  if (f.productIds) return { productId: inIds(f.productIds) };
  return f.productId ? { productId: oid(f.productId) } : {};
}

async function orderSales(filter, byDate) {
  const { timezone } = await getSettings();
  const _id = { productId: '$productId' };
  if (byDate) _id.date = { $dateToString: { format: '%Y-%m-%d', date: '$date', timezone } };
  const [products, sales] = await Promise.all([
    Order.distinct('productId', productScope(filter)),
    Order.aggregate([{ $match: orderMatch(filter, timezone) }, { $group: { _id, purchases: { $sum: 1 }, revenue: { $sum: '$amount' } } }]),
  ]);
  return { products: new Set(products.map(String)), sales };
}

export async function metricRows(filter = {}, keys = []) {
  const groupKeys = [...new Set(['productId', ...keys])];
  const group = { _id: Object.fromEntries(groupKeys.map((k) => [k, `$${k}`])) };
  for (const f of METRIC_FIELDS) group[f] = { $sum: `$${f}` };
  const [ads, orders] = await Promise.all([
    CampaignMetric.aggregate([{ $match: metricMatch(filter) }, { $group: group }]),
    adScoped(filter, keys) ? null : orderSales(filter, keys.includes('date')),
  ]);
  const keyOf = (r) => groupKeys.map((k) => String(r[k])).join('|');
  const merged = new Map();
  for (const { _id, ...sums } of ads) {
    const fromOrders = orders?.products.has(String(_id.productId));
    merged.set(keyOf(_id), { _id, ...sums, ...(fromOrders && { purchases: 0, revenue: 0 }) });
  }
  for (const { _id, purchases, revenue } of orders?.sales ?? []) {
    const k = keyOf(_id);
    merged.set(k, { ...(merged.get(k) ?? { _id, ...emptyTotals() }), purchases, revenue });
  }
  const rows = [...merged.values()];
  if (!rows.length) return [];
  const products = await Product.find({ _id: { $in: uniqueIds(rows.map((r) => r._id.productId)) } })
    .select('costs')
    .lean();
  const costs = idMap(products);
  return rows.map(({ _id, ...sums }) => ({
    ..._id,
    ...sums,
    ...variableCosts(sums, costs.get(String(_id.productId))?.costs),
  }));
}

function accumulate(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = String(r[key]);
    map.set(k, addTotals(map.get(k) ?? emptyTotals(), r));
  }
  return map;
}

const metricsFor = (map, id) => deriveMetrics(map.get(String(id)) ?? emptyTotals());

export async function summary(filter = {}) {
  return deriveMetrics(sumTotals(await metricRows(filter)));
}

export async function summaryWithCompare(filter = {}, prev = previousRange(filter)) {
  const [current, previous] = await Promise.all([summary(filter), prev ? summary({ ...filter, ...prev }) : null]);
  return {
    range: { from: filter.from ?? null, to: filter.to ?? null },
    previousRange: prev,
    current,
    previous,
    change: previous ? compareMetrics(current, previous) : null,
  };
}

export async function dataBounds(filter = {}) {
  const match = metricMatch(filter);
  const { timezone } = await getSettings();
  const orders = adScoped(filter) ? null : orderMatch(filter, timezone);
  const edges = await Promise.all([
    CampaignMetric.findOne(match).sort({ date: 1 }).select('date').lean(),
    CampaignMetric.findOne(match).sort({ date: -1 }).select('date').lean(),
    orders && Order.findOne(orders).sort({ date: 1 }).select('date').lean(),
    orders && Order.findOne(orders).sort({ date: -1 }).select('date').lean(),
  ]);
  const dates = edges.map((e, i) => e && (i < 2 ? e.date : isoDateIn(e.date, timezone))).filter(Boolean).sort();
  return dates.length ? { from: dates[0], to: dates.at(-1) } : null;
}

export async function timeseries(filter = {}) {
  let { from, to } = filter;
  if (!from || !to) {
    const bounds = await dataBounds(filter);
    if (!bounds) return { from: from ?? null, to: to ?? null, granularity: filter.granularity ?? 'day', points: [] };
    from ??= bounds.from;
    to ??= bounds.to;
  }
  const granularity = fitGranularity({ from, to }, filter.granularity ?? autoGranularity({ from, to }));
  const rows = await metricRows({ ...filter, from, to }, ['date']);
  const buckets = new Map(bucketRange(from, to, granularity).map((k) => [k, emptyTotals()]));
  for (const r of rows) {
    const bucket = buckets.get(bucketStart(r.date, granularity));
    if (bucket) addTotals(bucket, r);
  }
  return { from, to, granularity, points: [...buckets].map(([key, t]) => ({ key, ...deriveMetrics(t) })) };
}

export async function productPerformance(filter = {}) {
  const [rows, products] = await Promise.all([
    metricRows({ from: filter.from, to: filter.to, campaign: filter.campaign }),
    Product.find(filter.status ? { status: { $in: filter.status.split(',') } } : {})
      .select('name status category price version createdAt')
      .lean(),
  ]);
  const byProduct = accumulate(rows, 'productId');
  return products
    .map((p) => ({ ...p, hasData: byProduct.has(String(p._id)), ...metricsFor(byProduct, p._id) }))
    .filter((p) => filter.status || p.hasData || !['idea', 'researching'].includes(p.status))
    .sort((a, b) => b.revenue - a.revenue || b.spend - a.spend);
}

export async function experimentPerformance(filter = {}) {
  const query = {};
  if (filter.productId) query.productId = oid(filter.productId);
  if (filter.ids?.length) query._id = inIds(filter.ids);
  if (filter.status) query.status = { $in: filter.status.split(',') };
  if (filter.campaign) query.campaign = filter.campaign;
  const experiments = await Experiment.find(query).sort({ createdAt: -1 }).limit(filter.limit ?? 200).lean();
  if (!experiments.length) return [];
  const ids = experiments.map((e) => e._id);
  const [rows, products, creativeCounts] = await Promise.all([
    metricRows({ from: filter.from, to: filter.to, experimentIds: ids }, ['experimentId']),
    Product.find({ _id: { $in: uniqueIds(experiments.map((e) => e.productId)) } })
      .select('name status price')
      .lean(),
    AdCreative.aggregate([{ $match: { experimentId: { $in: ids } } }, { $group: { _id: '$experimentId', count: { $sum: 1 } } }]),
  ]);
  const byExperiment = accumulate(rows, 'experimentId');
  const productsById = idMap(products);
  const counts = new Map(creativeCounts.map((c) => [String(c._id), c.count]));
  return experiments.map((e) => ({
    ...e,
    product: productsById.get(String(e.productId)) ?? null,
    creativeCount: counts.get(String(e._id)) ?? 0,
    hasData: byExperiment.has(String(e._id)),
    ...metricsFor(byExperiment, e._id),
  }));
}

export async function creativePerformance(filter = {}) {
  const query = {};
  if (filter.experimentId) query.experimentId = oid(filter.experimentId);
  if (filter.productId) query.productId = oid(filter.productId);
  if (filter.ids?.length) query._id = inIds(filter.ids);
  const creatives = await AdCreative.find(query).sort({ createdAt: 1 }).limit(filter.limit ?? 300).lean();
  if (!creatives.length) return [];
  const [rows, experiments] = await Promise.all([
    metricRows({ from: filter.from, to: filter.to, campaign: filter.campaign, creativeIds: creatives.map((c) => c._id) }, ['creativeId']),
    Experiment.find({ _id: { $in: uniqueIds(creatives.map((c) => c.experimentId)) } })
      .select('name')
      .lean(),
  ]);
  const byCreative = accumulate(rows, 'creativeId');
  const experimentsById = idMap(experiments);
  return creatives.map((c) => ({
    ...c,
    experimentName: experimentsById.get(String(c.experimentId))?.name ?? '',
    hasData: byCreative.has(String(c._id)),
    ...metricsFor(byCreative, c._id),
  }));
}

export async function lifecycle() {
  const [products, ideas] = await Promise.all([
    Product.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ProductIdea.aggregate([{ $match: { status: { $ne: 'converted' } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const p = Object.fromEntries(products.map((x) => [x._id, x.count]));
  const i = Object.fromEntries(ideas.map((x) => [x._id, x.count]));
  return {
    stages: PRODUCT_STATUSES.map((status) => ({
      status,
      products: p[status] ?? 0,
      ideas: i[status] ?? 0,
      count: (p[status] ?? 0) + (i[status] ?? 0),
    })),
  };
}

export async function scaling() {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const monthStart = `${today.slice(0, 8)}01`;
  const daysInMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate();
  const products = await Product.find({ status: 'scaling' }).sort({ statusChangedAt: 1 }).lean();
  return Promise.all(
    products.map(async (p) => {
      const scaledAt = [...p.events].reverse().find((e) => e.type === 'status' && e.to === 'scaling')?.date;
      const since = scaledAt ?? isoDateIn(p.statusChangedAt ?? p.createdAt, timezone);
      const f = { productId: p._id };
      const [todayTotals, last7, mtd, sinceScaling, series] = await Promise.all([
        summary({ ...f, from: today, to: today }),
        summary({ ...f, from: addDays(today, -6), to: today }),
        summary({ ...f, from: monthStart, to: today }),
        summary({ ...f, from: since, to: today }),
        timeseries({ ...f, from: addDays(today, -29), to: today, granularity: 'day' }),
      ]);
      return {
        product: {
          _id: p._id,
          name: p.name,
          price: p.price,
          category: p.category,
          version: p.version,
          budget: p.budget,
          costs: p.costs,
          desiredMarginPct: p.desiredMarginPct,
        },
        since,
        today: todayTotals,
        last7,
        mtd,
        sinceScaling,
        perDay: {
          spend: round(last7.spend / 7),
          purchases: round(last7.purchases / 7, 1),
          revenue: round(last7.revenue / 7),
          contribution: round(last7.contribution / 7),
        },
        month: { day: +today.slice(8, 10), days: daysInMonth },
        series: series.points,
      };
    }),
  );
}

export async function graveyard() {
  const products = await Product.find({ status: 'killed' }).select('-events').sort({ killedAt: -1, updatedAt: -1 }).lean();
  const ids = products.map((p) => p._id);
  const [rows, experimentCounts, killDecisions, ideas] = await Promise.all([
    ids.length ? metricRows({ productIds: ids }) : [],
    ids.length
      ? Experiment.aggregate([{ $match: { productId: { $in: ids } } }, { $group: { _id: '$productId', count: { $sum: 1 } } }])
      : [],
    ids.length ? Decision.find({ productId: { $in: ids }, decision: 'kill' }).sort({ date: -1, createdAt: -1 }).lean() : [],
    ProductIdea.find({ status: 'killed' }).select('name category notes updatedAt').sort({ updatedAt: -1 }).limit(50).lean(),
  ]);
  const byProduct = accumulate(rows, 'productId');
  const counts = new Map(experimentCounts.map((x) => [String(x._id), x.count]));
  const lastKill = new Map();
  for (const d of killDecisions) if (!lastKill.has(String(d.productId))) lastKill.set(String(d.productId), d);
  const items = products.map((p) => {
    const d = lastKill.get(String(p._id));
    const end = p.killedAt ?? p.updatedAt;
    return {
      _id: p._id,
      name: p.name,
      category: p.category,
      price: p.price,
      createdAt: p.createdAt,
      killedAt: p.killedAt,
      killReason: p.killReason || d?.reason || '',
      learnings: p.learnings || d?.notes || '',
      experiments: counts.get(String(p._id)) ?? 0,
      lifespanDays: Math.max(0, Math.round((new Date(end) - new Date(p.createdAt)) / 86_400_000)),
      ...metricsFor(byProduct, p._id),
    };
  });
  return { items, totals: { products: items.length, ...deriveMetrics(sumTotals(rows)) }, ideas };
}

function orderMatch(filter, timezone) {
  const m = { paymentStatus: 'paid', ...productScope(filter) };
  if (filter.experimentId) m.experimentId = oid(filter.experimentId);
  if (filter.campaign) m.campaign = filter.campaign;
  if (filter.from || filter.to) {
    m.date = {};
    if (filter.from) m.date.$gte = startOfDayIn(filter.from, timezone);
    if (filter.to) m.date.$lt = startOfDayIn(addDays(filter.to, 1), timezone);
  }
  return m;
}

export async function orderAnalytics(filter = {}) {
  const { timezone } = await getSettings();
  const orders = await Order.find(orderMatch(filter, timezone))
    .select('items amount refundAmount date customerId')
    .sort({ date: 1 })
    .lean();
  const kinds = Object.fromEntries(ORDER_ITEM_KINDS.map((k) => [k, { orders: 0, revenue: 0 }]));
  const customers = new Set();
  let revenue = 0;
  let refunds = 0;
  for (const o of orders) {
    revenue += o.amount;
    refunds += o.refundAmount ?? 0;
    customers.add(String(o.customerId));
    const seen = new Set();
    for (const item of o.items) {
      kinds[item.kind].revenue += item.amount;
      if (!seen.has(item.kind)) kinds[item.kind].orders += 1;
      seen.add(item.kind);
    }
  }
  const count = orders.length;
  const totals = {
    orders: count,
    customers: customers.size,
    revenue: round(revenue),
    refunds: round(refunds),
    netRevenue: round(revenue - refunds),
    refundRate: round(percent(refunds, revenue), 1),
    aov: round(ratio(revenue, count)),
    frontEndAov: round(ratio(kinds.main.revenue, kinds.main.orders)),
    bumpRate: round(percent(kinds.bump.orders, count), 1),
    upsellRate: round(percent(kinds.upsell.orders, count), 1),
    bundleRate: round(percent(kinds.bundle.orders, count), 1),
    kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, { orders: v.orders, revenue: round(v.revenue) }])),
  };

  let { from, to, granularity } = filter;
  if (count && (!from || !to)) {
    from ??= isoDateIn(orders[0].date, timezone);
    to ??= isoDateIn(orders.at(-1).date, timezone);
  }
  if (!from || !to) return { totals, granularity: granularity ?? 'day', series: [] };
  granularity = fitGranularity({ from, to }, granularity ?? autoGranularity({ from, to }));
  const empty = (key) => ({ key, orders: 0, revenue: 0, ...Object.fromEntries(ORDER_ITEM_KINDS.map((k) => [k, 0])) });
  const buckets = new Map(bucketRange(from, to, granularity).map((k) => [k, empty(k)]));
  for (const o of orders) {
    const b = buckets.get(bucketStart(isoDateIn(o.date, timezone), granularity));
    if (!b) continue;
    b.orders += 1;
    b.revenue += o.amount;
    for (const item of o.items) b[item.kind] += item.amount;
  }
  const series = [...buckets.values()].map((b) => ({
    ...b,
    ...Object.fromEntries(ORDER_ITEM_KINDS.map((k) => [k, round(b[k])])),
    revenue: round(b.revenue),
    aov: round(ratio(b.revenue, b.orders)),
  }));
  return { totals, granularity, series };
}

export async function customerAnalytics(filter = {}) {
  const { timezone } = await getSettings();
  const [orders, customers] = await Promise.all([
    Order.find(orderMatch(filter, timezone)).select('customerId productId amount refundAmount').lean(),
    Customer.find({ orderCount: { $gt: 0 } }).select('name email firstPurchaseAt lastPurchaseAt').lean(),
  ]);
  const people = idMap(customers);
  const activity = new Map();
  for (const o of orders) {
    const key = String(o.customerId);
    const a = activity.get(key) ?? { orderCount: 0, spent: 0, productIds: new Set() };
    a.orderCount += 1;
    a.spent += o.amount - (o.refundAmount ?? 0);
    a.productIds.add(String(o.productId));
    activity.set(key, a);
  }
  const buyers = [...activity].map(([id, a]) => ({ _id: id, ...people.get(id), ...a, totalSpent: round(a.spent), productIds: [...a.productIds] }));
  const n = buyers.length;
  const repeat = buyers.filter((c) => c.orderCount > 1).length;
  const multiProduct = buyers.filter((c) => c.productIds.length > 1).length;
  const revenue = buyers.reduce((s, c) => s + c.spent, 0);

  const owned = { 1: 0, 2: 0, '3+': 0 };
  const owners = new Map();
  for (const c of buyers) {
    owned[c.productIds.length >= 3 ? '3+' : Math.max(c.productIds.length, 1)] += 1;
    for (const p of c.productIds) owners.set(p, (owners.get(p) ?? 0) + 1);
  }
  const topIds = [...owners].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
  const productsById = idMap(await Product.find({ _id: { $in: topIds } }).select('name status').lean());
  const products = topIds.map((id) => productsById.get(id)).filter(Boolean);
  const index = new Map(products.map((p, i) => [String(p._id), i]));
  const matrix = products.map(() => products.map(() => 0));
  for (const c of buyers) {
    const idx = c.productIds.map((p) => index.get(p)).filter((i) => i != null);
    for (const i of idx) for (const j of idx) matrix[i][j] += 1;
  }

  let series = [];
  let granularity = filter.granularity ?? null;
  if (filter.from && filter.to) {
    granularity = fitGranularity(filter, granularity ?? autoGranularity(filter));
    const buckets = new Map(bucketRange(filter.from, filter.to, granularity).map((k) => [k, { key: k, customers: 0 }]));
    for (const c of customers) {
      if (!c.firstPurchaseAt) continue;
      const day = isoDateIn(c.firstPurchaseAt, timezone);
      if (day < filter.from || day > filter.to) continue;
      const b = buckets.get(bucketStart(day, granularity));
      if (b) b.customers += 1;
    }
    series = [...buckets.values()];
  }

  return {
    totals: {
      customers: n,
      repeatCustomers: repeat,
      repeatRate: round(percent(repeat, n), 1),
      multiProductCustomers: multiProduct,
      avgValue: round(ratio(revenue, n)),
      revenue: round(revenue),
    },
    productsOwned: Object.entries(owned).map(([bucket, count]) => ({ bucket, count })),
    topCustomers: [...buyers]
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 10)
      .map(({ productIds, spent, ...c }) => ({ ...c, products: productIds.length })),
    overlap: { products: products.map((p) => ({ _id: p._id, name: p.name })), matrix },
    newCustomers: { granularity, series },
  };
}
