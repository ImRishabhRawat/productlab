import { COST_FIELDS, EXPERIMENT_VARIABLES, FUNNEL_STAGES, IDEA_SIGNALS, METRIC_FIELDS } from './constants.js';

const SUM_FIELDS = [...METRIC_FIELDS, ...COST_FIELDS];

export const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export function round(v, digits = 2) {
  if (!isNum(v)) return null;
  const f = 10 ** digits;
  return Math.round((v + Math.sign(v) * Number.EPSILON) * f) / f;
}

export const ratio = (a, b) => (num(b) > 0 ? num(a) / num(b) : null);
export const percent = (a, b) => (num(b) > 0 ? (num(a) / num(b)) * 100 : null);

export function pctChange(current, previous) {
  if (!isNum(current) || !isNum(previous) || previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

export function emptyTotals() {
  return Object.fromEntries(SUM_FIELDS.map((k) => [k, 0]));
}

export function addTotals(target, row) {
  for (const k of SUM_FIELDS) target[k] += num(row?.[k]);
  return target;
}

export const sumTotals = (rows) => rows.reduce((acc, r) => addTotals(acc, r), emptyTotals());

export function variableCosts({ revenue, purchases }, costs = {}) {
  return {
    fees: (num(revenue) * num(costs.paymentFeePct)) / 100,
    refunds: (num(revenue) * num(costs.refundRatePct)) / 100,
    otherCosts: num(purchases) * num(costs.variableCostPerSale),
  };
}

export function deriveMetrics(t = {}) {
  const base = Object.fromEntries(SUM_FIELDS.map((k) => [k, round(num(t[k]))]));
  const variable = num(t.fees) + num(t.refunds) + num(t.otherCosts);
  const contribution = num(t.revenue) - variable - num(t.spend);
  const cpm = ratio(t.spend, t.impressions);
  return {
    ...base,
    variableCosts: round(variable),
    contribution: round(contribution),
    contributionMargin: round(percent(contribution, t.revenue), 1),
    ctr: round(percent(t.clicks, t.impressions)),
    cpc: round(ratio(t.spend, t.clicks)),
    cpm: round(cpm == null ? null : cpm * 1000),
    checkoutRate: round(percent(t.checkouts, t.landingPageViews)),
    conversionRate: round(percent(t.purchases, t.landingPageViews)),
    cac: round(ratio(t.spend, t.purchases)),
    roas: round(ratio(t.revenue, t.spend)),
    aov: round(ratio(t.revenue, t.purchases)),
  };
}

export function compareMetrics(current, previous) {
  const change = {};
  for (const k of Object.keys(current)) change[k] = pctChange(current[k], previous?.[k]);
  return change;
}

export function funnel(t = {}) {
  const first = num(t[FUNNEL_STAGES[0].key]);
  const stages = FUNNEL_STAGES.map((s, i) => {
    const value = num(t[s.key]);
    const prev = i ? num(t[FUNNEL_STAGES[i - 1].key]) : null;
    return {
      ...s,
      value,
      stepRate: i ? round(percent(value, prev)) : null,
      overallRate: round(percent(value, first), 3),
      lost: i ? Math.max(prev - value, 0) : 0,
    };
  });
  let leakIndex = null;
  stages.forEach((s, i) => {
    if (i < 2 || s.stepRate == null) return;
    if (leakIndex == null || s.stepRate < stages[leakIndex].stepRate) leakIndex = i;
  });
  return { stages, leakIndex };
}

export function breakEven({
  price,
  aov,
  paymentFeePct = 0,
  refundRatePct = 0,
  variableCostPerSale = 0,
  desiredMarginPct = 0,
  adSpend = 0,
} = {}) {
  const revenuePerSale = num(aov) > 0 ? num(aov) : num(price);
  const netPerSale =
    revenuePerSale * (1 - (num(paymentFeePct) + num(refundRatePct)) / 100) - num(variableCostPerSale);
  const targetCac = netPerSale - (revenuePerSale * num(desiredMarginPct)) / 100;
  return {
    revenuePerSale: round(revenuePerSale),
    netPerSale: round(netPerSale),
    breakEvenCac: round(netPerSale),
    targetCac: round(targetCac),
    breakEvenRoas: netPerSale > 0 ? round(revenuePerSale / netPerSale) : null,
    targetRoas: targetCac > 0 ? round(revenuePerSale / targetCac) : null,
    breakEvenPurchases: netPerSale > 0 ? Math.ceil(num(adSpend) / netPerSale) : null,
    targetPurchases: targetCac > 0 ? Math.ceil(num(adSpend) / targetCac) : null,
  };
}

const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const score = (v) => (isNum(v) ? Math.min(Math.max(v, 0), 10) : null);

export function level(value, max = 10) {
  if (!isNum(value)) return null;
  const r = value / max;
  return r < 0.4 ? 'low' : r < 0.7 ? 'medium' : 'high';
}

export function ideaScores(idea = {}) {
  const signals = idea.validation?.signals ?? {};
  const signalValues = IDEA_SIGNALS.map((k) => score(signals[k]?.score)).filter(isNum);
  const demand = signalValues.length ? round(avg(signalValues), 1) : null;
  const effort = score(idea.effort);
  const ease = effort == null ? null : 10 - effort;
  const demonstrability = score(idea.demonstrability);
  const repeat = score(idea.repeatPotential);
  const risk = score(idea.legalRisk);
  const parts = [demand, ease, demonstrability, repeat, risk == null ? null : 10 - risk].filter(isNum);
  const potential = parts.length ? Math.round(avg(parts) * 10) : null;
  return {
    demand,
    ease,
    demonstrability,
    repeat,
    risk,
    potential,
    potentialLevel: level(potential, 100),
    difficultyLevel: level(effort),
    riskLevel: level(risk),
  };
}

const normalize = (v) => (v == null ? '' : String(v).trim().toLowerCase());

export function changedVariables(a = {}, b = {}) {
  return EXPERIMENT_VARIABLES.filter(({ key }) => normalize(a?.[key]) !== normalize(b?.[key])).map((v) => v.key);
}

export function goalProgress(current, target) {
  if (!isNum(current) || !isNum(target) || target <= 0) return null;
  if (current >= target) return 100;
  return Math.min(round(Math.max((current / target) * 100, 0), 1), 99.9);
}

export const countsTowardProgress = (block) => block.category !== 'break';

export const habitTarget = (targetPerWeek, days = 7) => Math.ceil((targetPerWeek * Math.min(days, 7)) / 7);

export function habitWeek(targetPerWeek, days, checks) {
  const target = habitTarget(targetPerWeek, days);
  let done = 0;
  let credited = 0;
  let possible = 0;
  return checks.map((checked, i) => {
    if (checked) done += 1;
    const nextCredited = Math.min(done, target);
    const nextPossible = Math.min(target, Math.max(done, target - (days - i - 1)));
    const step = { done: nextCredited - credited, possible: nextPossible - possible };
    credited = nextCredited;
    possible = nextPossible;
    return step;
  });
}

export function dayProgress({ outcomeSet = false, outcomeDone = false, blocksDue = 0, blocksDone = 0, habitsTotal = 0, habitsDone = 0 } = {}) {
  const parts = [];
  if (outcomeSet) parts.push(outcomeDone ? 1 : 0);
  if (blocksDue > 0) parts.push(Math.min(blocksDone / blocksDue, 1));
  if (habitsTotal > 0) parts.push(Math.min(habitsDone / habitsTotal, 1));
  return parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) : null;
}
