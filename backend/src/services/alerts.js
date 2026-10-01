import { GOAL_MONEY_TRACKING, GOAL_PRODUCT_TRACKING, LABELS, PURCHASE_MILESTONES } from '@product-lab/shared/constants';
import Experiment from '../models/Experiment.js';
import Goal from '../models/Goal.js';
import Product from '../models/Product.js';
import { summary } from './analytics.js';
import { notify } from './notify.js';
import { goalValues } from './productivity.js';
import { getSettings } from './settings.js';

const EVENT = { background: true, ttl: 24 * 3600 };

export async function money() {
  const s = await getSettings();
  const nf = new Intl.NumberFormat(s.locale, { style: 'currency', currency: s.currency, maximumFractionDigits: 0 });
  return (v) => nf.format(v ?? 0);
}

const productName = async (id) => (await Product.findById(id).select('name').lean())?.name ?? 'Product';

export async function orderAlerts(order, previous = null) {
  const fmt = await money();
  const name = await productName(order.productId);
  const becamePaid = order.paymentStatus === 'paid' && previous?.paymentStatus !== 'paid';
  if (becamePaid) {
    await notify({
      category: 'business',
      type: 'new_order',
      title: `New order · ${fmt(order.amount)}`,
      body: `${name} · ${order.items.map((i) => LABELS.orderItemKind[i.kind]).join(' + ')}`,
      url: `/products/${order.productId}`,
      dedupeKey: `order:${order._id}`,
      ...EVENT,
    });
  }
  if (order.refundStatus !== 'none' && order.refundStatus !== (previous?.refundStatus ?? 'none')) {
    await notify({
      category: 'business',
      type: 'refund',
      title: `Refund · ${fmt(order.refundAmount)}`,
      body: `${name} · ${LABELS.refundStatus[order.refundStatus]}`,
      url: `/products/${order.productId}`,
      dedupeKey: `refund:${order._id}:${order.refundStatus}`,
      ...EVENT,
    });
  }
}

export async function metricAlerts(entry, addedPurchases = entry.purchases) {
  if (entry.experimentId && addedPurchases > 0) {
    const totals = await summary({ experimentId: entry.experimentId });
    const before = totals.purchases - addedPurchases;
    const milestone = PURCHASE_MILESTONES.filter((m) => before < m && totals.purchases >= m).at(-1);
    if (milestone) {
      const fmt = await money();
      const experiment = await Experiment.findById(entry.experimentId).select('name').lean();
      await notify({
        category: 'business',
        type: 'experiment_milestone',
        title: `${experiment?.name ?? 'Experiment'} crossed ${milestone} purchases`,
        body: `CAC ${fmt(totals.cac)}${totals.roas == null ? '' : ` · ROAS ${totals.roas}x`} so far`,
        url: `/experiments/${entry.experimentId}`,
        dedupeKey: `milestone:${entry.experimentId}:${milestone}`,
        ...EVENT,
      });
    }
  }
  if (entry.productId) await goalAlerts({ productIds: entry.productId });
}

export async function goalAlerts(filter) {
  const goals = await Goal.find({ status: 'active', achievedAt: null, tracking: { $in: GOAL_PRODUCT_TRACKING }, ...filter }).lean();
  if (!goals.length) return;
  const fmt = await money();
  for (const goal of await goalValues(goals)) {
    if (!(goal.progress >= 100)) continue;
    await Goal.updateOne({ _id: goal._id }, { $set: { achievedAt: new Date() } });
    const value = (v) => (GOAL_MONEY_TRACKING.includes(goal.tracking) ? fmt(v) : `${v}`);
    await notify({
      category: 'business',
      type: 'goal_reached',
      title: `Goal reached: ${goal.title}`,
      body: `${value(goal.current)} of ${value(goal.targetValue)} target`,
      url: `/goals/${goal._id}`,
      dedupeKey: `goal:${goal._id}:${goal.targetValue}`,
      ...EVENT,
    });
  }
}
