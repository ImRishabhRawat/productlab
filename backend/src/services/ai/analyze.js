import { IDEA_SIGNALS, LABELS, LEVELS, SMALL_SAMPLE_PURCHASES } from '@product-lab/shared/constants';
import { breakEven, changedVariables, funnel, ideaScores, pctChange } from '@product-lab/shared/metrics';
import { config } from '../../config.js';
import AIAnalysis from '../../models/AIAnalysis.js';
import Decision from '../../models/Decision.js';
import Experiment from '../../models/Experiment.js';
import Product from '../../models/Product.js';
import ProductIdea from '../../models/ProductIdea.js';
import { notFound } from '../../utils/http.js';
import { creativePerformance, experimentPerformance, orderAnalytics, summary, timeseries } from '../analytics.js';
import { getSettings, today } from '../settings.js';
import { productTimeline } from '../timeline.js';
import { NUMBER, STRING, assertConfigured, generateJson, list, obj, oneOf } from './gemini.js';

const TOTALS = ['spend', 'impressions', 'clicks', 'landingPageViews', 'checkouts', 'purchases', 'revenue', 'contribution', 'contributionMargin', 'ctr', 'cpc', 'cpm', 'checkoutRate', 'conversionRate', 'cac', 'roas', 'aov'];
const CORE = ['spend', 'purchases', 'revenue', 'ctr', 'cpc', 'conversionRate', 'cac', 'roas'];
const CREATIVE = ['spend', 'impressions', 'clicks', 'purchases', 'revenue', 'ctr', 'cpc', 'conversionRate', 'cac', 'roas'];
const RATES = ['ctr', 'cpc', 'cpm', 'checkoutRate', 'conversionRate', 'cac', 'roas', 'aov'];
const HIGHLIGHTS = ['idea', 'validation', 'created', 'status', 'price', 'version', 'milestone', 'purchase'];

const LEVEL = oneOf(LEVELS);
const SCHEMAS = {
  idea: obj({
    targetAudience: STRING,
    problemDesire: STRING,
    purchaseMotivation: STRING,
    productFormats: list(STRING),
    priceRange: obj({ min: NUMBER, max: NUMBER, rationale: STRING }),
    adAngles: list(obj({ angle: STRING, hook: STRING })),
    landingPageAngle: STRING,
    objections: list(obj({ objection: STRING, response: STRING })),
    productionConsiderations: list(STRING),
    risks: list(obj({ risk: STRING, severity: LEVEL })),
    validationSuggestions: list(STRING),
    summary: STRING,
  }),
  experiment: obj({
    observations: list(obj({ title: STRING, detail: STRING })),
    bottleneck: obj({ stage: STRING, detail: STRING }),
    strongest: list(STRING),
    weakest: list(STRING),
    hypotheses: list(obj({ hypothesis: STRING, rationale: STRING, confidence: LEVEL })),
    nextSteps: list(obj({ action: STRING, why: STRING })),
    summary: STRING,
  }),
  product: obj({
    insights: list(obj({ observation: STRING, hypothesis: STRING, nextTest: STRING })),
    risks: list(STRING),
    opportunities: list(STRING),
    summary: STRING,
  }),
};

const RULES = `You are the analyst inside Product Lab, the private control room of a solo founder in India who tests and scales low-priced digital products with Meta ads.
Rules:
- Ground every statement in the JSON data you are given. Never invent numbers, dates, benchmarks, competitors, customers or events. When you cite a number, copy it from the data. Money is in the given currency (INR is written ₹1,499); rates are percentages.
- Keep facts and interpretation apart. An observation must be checkable in the data. A cause, motive or prediction is a hypothesis and must be worded as one ("may", "could", "likely").
- When the data is too thin to judge (for example fewer than ${SMALL_SAMPLE_PURCHASES} purchases or only a few days of spend), say so plainly and lower confidence instead of guessing.
- Be specific and brief: name the creative, variable, stage or date involved. One or two short sentences per field. No generic marketing advice, no filler, no markdown.
- Definitions: CTR = clicks / impressions. Checkout rate = checkouts / landing page views. Conversion rate = purchases / landing page views. CAC = spend / purchases. ROAS = revenue / spend. Contribution = revenue - payment fees - refunds - other variable costs - ad spend. Funnel pctOfPrevious = share of the previous stage that reached this stage.`;

const TASKS = {
  idea: `Task: assess a digital product idea before money is spent on it.
- Scores are 0-10 (risk: higher is riskier; ease = 10 - effort) and potential is 0-100. Missing fields are unknown: infer carefully and call the inference an assumption.
- productFormats: 2-4 concrete formats, e.g. "Notion template" or "40-page PDF guide".
- priceRange: a realistic price range for this market. Use expectedPrice, competitor prices and price examples when present and mention them in the rationale; otherwise say the range is an untested assumption.
- adAngles: 3-5 distinct angles, each with a short scroll-stopping hook line.
- landingPageAngle: the headline promise and proof the page should lead with.
- objections: 3-5 likely buyer objections, each with how the offer should answer it.
- productionConsiderations: 2-4 points on effort, tools, rights and delivery.
- risks: 2-4 risks (legal or IP, refunds, ad policy, demand) with severity.
- validationSuggestions: 3-5 cheap tests that can run within a week, each with a clear pass or fail signal.
- summary: one or two sentences on the idea's promise and its main risk.`,
  experiment: `Task: review one ad experiment.
- observations: 3-5 notable facts, such as unusual changes in the trend, gaps between creatives, or shifts versus the previous experiment, each with the numbers behind it.
- bottleneck: the funnel stage losing the most potential buyers (use pctOfPrevious) and why it matters here.
- strongest and weakest: 2-4 short labels each, metric plus value, e.g. "CTR 2.9%".
- hypotheses: 2-4 possible explanations for what the data shows. They are hypotheses, not facts. Set confidence from data volume and consistency.
- nextSteps: 2-4 concrete actions, changing one variable at a time where possible, each with why.
- Compare CAC and ROAS with the break-even and target values, and with the previous experiment when available.
- summary: one or two sentences on how the test is doing and the single most important next move.`,
  product: `Task: summarize a product's performance across its history and point to what to investigate next.
- insights: 3-5 items, each an observation, a hypothesis and a next test. The observation is a fact from the data with numbers or dates (e.g. "CTR rose from 1.8% to 2.9% after Creative B launched on 12 Aug"). The hypothesis is a possible cause worded as uncertain (e.g. "The new hook may be attracting higher-intent traffic"). The next test is one concrete experiment that would confirm or reject it (e.g. "Compare Creative B against the original creative with the same offer").
- risks and opportunities: 2-4 short, specific items each.
- summary: one or two sentences on where the product stands: trajectory and unit economics against break-even.`,
};

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k]]));

function compact(v) {
  if (Array.isArray(v)) {
    const items = v.map(compact).filter((x) => x !== undefined);
    return items.length ? items : undefined;
  }
  if (v && v.constructor === Object) {
    const entries = Object.entries(v)
      .map(([k, x]) => [k, compact(x)])
      .filter(([, x]) => x !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return v === null || v === undefined || v === '' ? undefined : v;
}

function headline(text) {
  const words = text.split(/\s+/);
  const short = words.slice(0, 8).join(' ');
  return words.length > 8 || short.length > 80 ? `${short.slice(0, 80).trimEnd()}…` : short;
}

const changes = (a, b) => changedVariables(a, b).map((k) => ({ variable: LABELS.variable[k], from: a?.[k], to: b?.[k] }));
const trendRows = (ts) => (ts.points.length ? { granularity: ts.granularity, points: ts.points.map((p) => ({ period: p.key, ...pick(p, CORE) })) } : null);
const creativeRow = (c) => ({ ...pick(c, ['name', 'hook', 'format', 'angle', 'startDate']), ...(c.hasData ? pick(c, CREATIVE) : { noData: true }) });
const decisionRow = (d) => ({ date: d.date, decision: LABELS.decision[d.decision], reason: d.reason, notes: d.notes });

function funnelSteps(totals) {
  const { stages, leakIndex } = funnel(totals);
  return {
    stages: stages.map((s) => ({ stage: s.label, count: s.value, pctOfPrevious: s.stepRate })),
    weakestStep: stages[leakIndex]?.label,
  };
}

function economics({ costs = {}, desiredMarginPct }, price, totals) {
  const unit = breakEven({ price, aov: totals?.aov, ...costs, desiredMarginPct, adSpend: totals?.spend });
  return { price, ...pick(costs, ['paymentFeePct', 'refundRatePct', 'variableCostPerSale']), desiredMarginPct, ...pick(unit, ['netPerSale', 'breakEvenCac', 'targetCac', 'breakEvenRoas', 'targetRoas']) };
}

async function ideaContext(id, prompt) {
  if (!id) return { title: headline(prompt), context: { idea: { description: prompt } } };
  const idea = await ProductIdea.findById(id).lean();
  if (!idea) throw notFound('Idea');
  const v = idea.validation ?? {};
  return {
    title: idea.name,
    context: {
      idea: pick(idea, ['name', 'category', 'targetCustomer', 'problem', 'format', 'deliverable', 'expectedPrice', 'source', 'notes']),
      status: LABELS.status[idea.status],
      scores: pick(ideaScores(idea), ['demand', 'ease', 'demonstrability', 'repeat', 'risk', 'potential']),
      validation: {
        ...pick(v, ['audience', 'painDesire', 'rightsNotes', 'priceExamples']),
        signals: Object.fromEntries(IDEA_SIGNALS.map((k) => [k, v.signals?.[k]])),
        competitors: v.competitors?.map((c) => pick(c, ['name', 'price', 'notes'])),
        ads: v.ads?.map((a) => pick(a, ['label', 'notes'])),
      },
      ownerNotes: prompt,
    },
  };
}

async function experimentContext(id) {
  const experiment = await Experiment.findById(id).lean();
  if (!experiment) throw notFound('Experiment');
  const [product, siblings, creatives, decisions, trend] = await Promise.all([
    Product.findById(experiment.productId).select('name category price status version costs desiredMarginPct').lean(),
    experimentPerformance({ productId: experiment.productId }),
    creativePerformance({ experimentId: id }),
    Decision.find({ experimentId: id }).sort({ date: 1 }).lean(),
    timeseries({ experimentId: id }),
  ]);
  const index = siblings.findIndex((x) => String(x._id) === String(id));
  const current = siblings[index] ?? (await summary({ experimentId: id }));
  const previous = index >= 0 ? siblings[index + 1] : null;
  return {
    title: experiment.name,
    context: {
      product: product && { ...pick(product, ['name', 'category', 'price', 'version']), status: LABELS.status[product.status] },
      experiment: {
        ...pick(experiment, ['name', 'hypothesis', 'startDate', 'endDate', 'campaign', 'budget', 'dailyBudget', 'changeNote', 'notes']),
        status: LABELS.experimentStatus[experiment.status],
        variables: experiment.variables,
      },
      totals: pick(current, TOTALS),
      funnel: funnelSteps(current),
      economics: product && economics(product, experiment.variables?.price ?? product.price, current),
      creatives: creatives.map(creativeRow),
      trend: trendRows(trend),
      previousExperiment: previous && {
        ...pick(previous, ['name', 'startDate', 'endDate']),
        changed: changes(previous.variables, experiment.variables),
        totals: pick(previous, CORE),
        pctChange: Object.fromEntries(RATES.map((k) => [k, pctChange(current[k], previous[k])])),
      },
      decisions: decisions.map(decisionRow),
    },
  };
}

async function productContext(id) {
  const product = await Product.findById(id).lean();
  if (!product) throw notFound('Product');
  const [totals, trend, experiments, creatives, decisions, timeline, orders] = await Promise.all([
    summary({ productId: id }),
    timeseries({ productId: id }),
    experimentPerformance({ productId: id }),
    creativePerformance({ productId: id }),
    Decision.find({ productId: id }).sort({ date: 1 }).lean(),
    productTimeline(product),
    orderAnalytics({ productId: id }),
  ]);
  const ordered = [...experiments].reverse();
  return {
    title: product.name,
    context: {
      product: {
        ...pick(product, ['name', 'category', 'description', 'format', 'deliverable', 'targetCustomer', 'version', 'killReason', 'learnings']),
        status: LABELS.status[product.status],
      },
      totals: pick(totals, TOTALS),
      economics: economics(product, product.price, totals),
      orders: orders.totals.orders ? pick(orders.totals, ['orders', 'aov', 'frontEndAov', 'bumpRate', 'upsellRate', 'bundleRate', 'refundRate']) : null,
      trend: trendRows(trend),
      experiments: ordered.map((x, i) => ({
        ...pick(x, ['name', 'startDate', 'endDate', 'hypothesis']),
        status: LABELS.experimentStatus[x.status],
        ...(i ? { changedFromPrevious: changes(ordered[i - 1].variables, x.variables) } : { variables: x.variables }),
        ...(x.hasData ? pick(x, CORE) : { noData: true }),
      })),
      creatives: creatives.filter((c) => c.hasData).map((c) => ({ ...creativeRow(c), experiment: c.experimentName })),
      decisions: decisions.map(decisionRow),
      timeline: timeline.filter((e) => HIGHLIGHTS.includes(e.type)).map((e) => pick(e, ['date', 'title', 'note', 'from', 'to'])),
    },
  };
}

const CONTEXTS = { idea: ideaContext, experiment: experimentContext, product: productContext };

export async function analyze({ kind, targetId, prompt }) {
  assertConfigured();
  const { title, context } = await CONTEXTS[kind](targetId, prompt);
  const { currency } = await getSettings();
  const input = compact({ currency, today: await today(), ...context, ...(kind !== 'idea' && { ownerQuestion: prompt }) });
  const output = await generateJson({
    system: `${RULES}\n\n${TASKS[kind]}`,
    prompt: `Analyze this ${kind}. Data (JSON):\n${JSON.stringify(input)}`,
    schema: SCHEMAS[kind],
  });
  return AIAnalysis.create({ kind, targetId: targetId ?? null, title, input, output, model: config.gemini.model });
}
