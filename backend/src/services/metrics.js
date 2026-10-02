import { METRIC_FIELDS } from '@product-lab/shared/constants';
import { addDays } from '@product-lab/shared/dates';
import { addTotals, emptyTotals, round } from '@product-lab/shared/metrics';
import { metricImportRowSchema, parseRows } from '@product-lab/shared/schemas';
import AdCreative from '../models/AdCreative.js';
import CampaignMetric from '../models/CampaignMetric.js';
import Experiment from '../models/Experiment.js';
import Product from '../models/Product.js';
import { badRequest } from '../utils/http.js';
import { metricAlerts } from './alerts.js';
import { today } from './settings.js';

export const alertFailed = (err) => console.error(`Metric alert failed: ${err.message}`);
const keyOf = ({ date, campaign = '', adSet = '' }) => JSON.stringify([date, campaign, adSet]);

export async function resolveRefs({ productId, experimentId, creativeId, campaign }) {
  let fallbackCampaign = '';
  if (creativeId) {
    const creative = await AdCreative.findById(creativeId).lean();
    if (!creative) throw badRequest('Creative not found', { creativeId: 'Creative not found' });
    if (experimentId && experimentId !== String(creative.experimentId)) {
      throw badRequest('Creative belongs to another experiment', { creativeId: 'Creative belongs to another experiment' });
    }
    experimentId = String(creative.experimentId);
    fallbackCampaign = creative.campaign;
  }
  if (experimentId) {
    const experiment = await Experiment.findById(experimentId).lean();
    if (!experiment) throw badRequest('Experiment not found', { experimentId: 'Experiment not found' });
    if (productId && productId !== String(experiment.productId)) {
      throw badRequest('Experiment belongs to another product', { experimentId: 'Experiment belongs to another product' });
    }
    productId = String(experiment.productId);
    fallbackCampaign ||= experiment.campaign;
  }
  if (!productId) throw badRequest('Choose a product', { productId: 'Choose a product' });
  if (!(await Product.exists({ _id: productId }))) throw badRequest('Product not found', { productId: 'Product not found' });
  return {
    productId,
    experimentId: experimentId || null,
    creativeId: creativeId || null,
    campaign: campaign || fallbackCampaign || '',
  };
}

export async function importMetrics({ productId, experimentId = null, mode, dryRun, rows }) {
  await resolveRefs({ productId, experimentId });
  const { valid, failed } = parseRows(metricImportRowSchema, rows);
  const groups = new Map();
  for (const { data } of valid) {
    const { date, campaign = '', adSet = '', notes = '' } = data;
    const key = keyOf(data);
    if (!groups.has(key)) groups.set(key, { date, campaign, adSet, notes, totals: emptyTotals() });
    const group = groups.get(key);
    group.notes ||= notes;
    addTotals(group.totals, data);
  }
  const dates = [...new Set([...groups.values()].map((g) => g.date))];
  const docs = await CampaignMetric.find({ productId, experimentId, creativeId: null, date: { $in: dates } }).sort({ _id: -1 });
  const existing = new Map(docs.map((d) => [keyOf(d), d]));
  const created = [];
  const updated = [];
  let unchanged = 0;

  for (const [key, { totals, ...fields }] of groups) {
    const values = Object.fromEntries(METRIC_FIELDS.map((f) => [f, round(totals[f])]));
    const doc = existing.get(key);
    if (!doc) {
      created.push({ doc: new CampaignMetric({ productId, experimentId, ...fields, ...values }), added: values.purchases });
    } else if (mode === 'skip') {
      unchanged += 1;
    } else {
      const before = doc.purchases;
      doc.set(values);
      if (doc.isModified()) updated.push({ doc, added: doc.purchases - before });
      else unchanged += 1;
    }
  }

  if (!dryRun) {
    const written = [...created, ...updated];
    if (written.length) await CampaignMetric.bulkSave(written.map((w) => w.doc));
    const since = addDays(await today(), -1);
    const recent = written.filter((w) => w.doc.date >= since);
    if (recent.length) {
      await metricAlerts({ productId, experimentId }, recent.reduce((sum, w) => sum + w.added, 0)).catch(alertFailed);
    }
  }
  return { created: created.length, updated: updated.length, unchanged, failed };
}
