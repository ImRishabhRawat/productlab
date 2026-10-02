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
const overlaps = (a, b) => !a.campaign || !b.campaign || (a.campaign === b.campaign && (!a.adSet || !b.adSet || a.adSet === b.adSet));

function recordedAs(doc, experimentId) {
  if (doc.creativeId) return 'per creative';
  if (String(doc.experimentId ?? '') !== String(experimentId ?? '')) {
    return doc.experimentId ? `under ${experimentId ? 'another' : 'an'} experiment` : 'without an experiment';
  }
  return !doc.campaign ? 'without a campaign' : doc.adSet ? 'per ad set' : 'per campaign';
}

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

export async function importMetrics({ productId, experimentId = null, mode, columns = METRIC_FIELDS, dryRun, rows }) {
  await resolveRefs({ productId, experimentId });
  const { valid, failed } = parseRows(metricImportRowSchema, rows);
  const groups = new Map();
  for (const { row, data } of valid) {
    const { date, campaign = '', adSet = '', notes = '' } = data;
    const key = keyOf(data);
    if (!groups.has(key)) groups.set(key, { row, date, campaign, adSet, notes, totals: emptyTotals() });
    const group = groups.get(key);
    group.notes ||= notes;
    addTotals(group.totals, data);
  }
  const recorded = new Map([...groups.values()].map((g) => [g.date, []]));
  for (const doc of await CampaignMetric.find({ productId, date: { $in: [...recorded.keys()] } }).sort({ _id: 1 })) {
    recorded.get(doc.date).push(doc);
  }
  const sameScope = (doc) => !doc.creativeId && String(doc.experimentId ?? '') === String(experimentId ?? '');
  const besideProductRow = (doc, key) => experimentId && !doc.experimentId && !doc.creativeId && keyOf(doc) === key;
  const created = [];
  const updated = [];
  let unchanged = 0;

  for (const [key, { row, totals, ...scope }] of groups) {
    const values = Object.fromEntries(METRIC_FIELDS.map((f) => [f, round(totals[f])]));
    const day = recorded.get(scope.date);
    const doc = day.find((d) => sameScope(d) && keyOf(d) === key);
    if (!doc) {
      const clash = day.find((d) => overlaps(d, scope) && !besideProductRow(d, key));
      if (clash) {
        const message = `Already recorded ${recordedAs(clash, experimentId)}: delete those entries or import at the same level`;
        failed.push({ row, message, fields: { date: message } });
        continue;
      }
      const fresh = new CampaignMetric({ productId, experimentId, ...scope, ...values });
      day.push(fresh);
      created.push({ doc: fresh, added: values.purchases });
    } else if (mode === 'skip') {
      unchanged += 1;
    } else {
      const before = doc.purchases;
      doc.set(Object.fromEntries(columns.map((f) => [f, values[f]])));
      if (doc.isModified()) updated.push({ doc, added: doc.purchases - before });
      else unchanged += 1;
    }
  }

  if (!dryRun) {
    const written = [...created, ...updated];
    if (written.length) await CampaignMetric.bulkSave(written.map((w) => w.doc));
    const end = await today();
    const since = addDays(end, -1);
    const recent = written.filter((w) => w.doc.date >= since && w.doc.date <= end);
    if (recent.length) {
      await metricAlerts({ productId, experimentId }, recent.reduce((sum, w) => sum + w.added, 0)).catch(alertFailed);
    }
  }
  return { created: created.length, updated: updated.length, unchanged, failed: failed.sort((a, b) => a.row - b.row) };
}
