import { describe, expect, it } from 'vitest';
import {
  breakEven,
  changedVariables,
  deriveMetrics,
  funnel,
  ideaScores,
  level,
  pctChange,
  round,
  sumTotals,
  variableCosts,
} from '../src/metrics.js';

const ZERO_SUMS = {
  spend: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  landingPageViews: 0,
  checkouts: 0,
  purchases: 0,
  revenue: 0,
  fees: 0,
  refunds: 0,
  otherCosts: 0,
};

describe('round', () => {
  it('rounds halves away from zero despite binary float error', () => {
    expect([round(1.005), round(-1.005), round(2.675), round(1.23456, 3), round(0.1 + 0.2)]).toEqual([1.01, -1.01, 2.68, 1.235, 0.3]);
  });

  it('returns null for anything that is not a finite number', () => {
    expect([round(null), round(undefined), round(NaN), round(Infinity), round('5')]).toEqual([null, null, null, null, null]);
  });
});

describe('deriveMetrics', () => {
  const totals = {
    spend: 2500,
    impressions: 120000,
    reach: 80000,
    clicks: 3000,
    landingPageViews: 2400,
    checkouts: 300,
    purchases: 90,
    revenue: 26910,
    fees: 672.75,
    refunds: 1345.5,
    otherCosts: 900,
  };

  it('derives every KPI from summed totals', () => {
    expect(deriveMetrics(totals)).toEqual({
      ...totals,
      variableCosts: 2918.25,
      contribution: 21491.75,
      contributionMargin: 79.9,
      ctr: 2.5,
      cpc: 0.83,
      cpm: 20.83,
      checkoutRate: 12.5,
      conversionRate: 3.75,
      cac: 27.78,
      roas: 10.76,
      aov: 299,
    });
  });

  it('returns null for every ratio when denominators are zero', () => {
    expect(deriveMetrics({})).toEqual({
      ...ZERO_SUMS,
      variableCosts: 0,
      contribution: 0,
      contributionMargin: null,
      ctr: null,
      cpc: null,
      cpm: null,
      checkoutRate: null,
      conversionRate: null,
      cac: null,
      roas: null,
      aov: null,
    });
  });

  it('keeps ratios whose denominator is present', () => {
    expect(deriveMetrics({ spend: 500, impressions: 1000 })).toMatchObject({
      ctr: 0,
      cpm: 500,
      cpc: null,
      cac: null,
      roas: 0,
      aov: null,
      contribution: -500,
      contributionMargin: null,
    });
  });

  it('rounds sums to two decimals and ignores non-numeric values', () => {
    expect(deriveMetrics({ revenue: 0.1 + 0.2, fees: 0.1, refunds: 0.2, clicks: '12' })).toMatchObject({
      revenue: 0.3,
      clicks: 0,
      variableCosts: 0.3,
      contribution: 0,
      contributionMargin: 0,
    });
  });
});

describe('variableCosts and contribution', () => {
  const costs = { paymentFeePct: 2.5, refundRatePct: 4, variableCostPerSale: 15 };

  it('applies the product cost settings to revenue and purchases', () => {
    expect(variableCosts({ revenue: 10000, purchases: 20 }, costs)).toEqual({ fees: 250, refunds: 400, otherCosts: 300 });
  });

  it('treats missing cost settings as zero', () => {
    expect(variableCosts({ revenue: 10000, purchases: 20 })).toEqual({ fees: 0, refunds: 0, otherCosts: 0 });
  });

  it('subtracts variable costs and ad spend from revenue', () => {
    const sums = { spend: 3000, revenue: 10000, purchases: 20 };
    expect(deriveMetrics({ ...sums, ...variableCosts(sums, costs) })).toMatchObject({
      variableCosts: 950,
      contribution: 6050,
      contributionMargin: 60.5,
    });
  });

  it('reports a negative margin when spend exceeds net revenue', () => {
    expect(deriveMetrics({ spend: 1200, revenue: 1000, fees: 25 })).toMatchObject({ contribution: -225, contributionMargin: -22.5 });
  });

  it('sums metric and cost fields across rows', () => {
    const rows = [{ spend: 10, revenue: 20, fees: 1 }, { spend: 5.5, purchases: 2, refunds: 3, clicks: '7' }, null];
    expect(sumTotals(rows)).toEqual({ ...ZERO_SUMS, spend: 15.5, purchases: 2, revenue: 20, fees: 1, refunds: 3 });
  });
});

describe('funnel', () => {
  const pick = ({ stages }) => stages.map(({ key, value, stepRate, overallRate, lost }) => ({ key, value, stepRate, overallRate, lost }));

  it('computes step rates, overall rates and drop-offs', () => {
    const result = funnel({ impressions: 10000, clicks: 200, landingPageViews: 150, checkouts: 30, purchases: 12 });
    expect(pick(result)).toEqual([
      { key: 'impressions', value: 10000, stepRate: null, overallRate: 100, lost: 0 },
      { key: 'clicks', value: 200, stepRate: 2, overallRate: 2, lost: 9800 },
      { key: 'landingPageViews', value: 150, stepRate: 75, overallRate: 1.5, lost: 50 },
      { key: 'checkouts', value: 30, stepRate: 20, overallRate: 0.3, lost: 120 },
      { key: 'purchases', value: 12, stepRate: 40, overallRate: 0.12, lost: 18 },
    ]);
    expect(result.stages[0].label).toBe('Impressions');
  });

  it('ignores the impressions to clicks step when finding the leak', () => {
    expect(funnel({ impressions: 10000, clicks: 200, landingPageViews: 150, checkouts: 30, purchases: 12 }).leakIndex).toBe(3);
    expect(funnel({ impressions: 1000, clicks: 100, landingPageViews: 10, checkouts: 5, purchases: 4 }).leakIndex).toBe(2);
    expect(funnel({ impressions: 100, clicks: 100, landingPageViews: 80, checkouts: 40, purchases: 20 }).leakIndex).toBe(3);
  });

  it('handles empty and partial funnels without dividing by zero', () => {
    const empty = funnel({});
    expect(empty.leakIndex).toBeNull();
    expect(empty.stages.every((s) => s.value === 0 && s.stepRate === null && s.overallRate === null && s.lost === 0)).toBe(true);

    const partial = funnel({ impressions: 12345, clicks: 20000, purchases: 7 });
    expect(partial.stages[1]).toMatchObject({ stepRate: 162.01, lost: 0 });
    expect(partial.stages[4]).toMatchObject({ stepRate: null, overallRate: 0.057 });
    expect(partial.leakIndex).toBe(2);
  });
});

describe('breakEven', () => {
  it('computes break-even and target CAC and ROAS from price and costs', () => {
    expect(
      breakEven({ price: 500, paymentFeePct: 2.5, refundRatePct: 5, variableCostPerSale: 20, desiredMarginPct: 20, adSpend: 10000 }),
    ).toEqual({
      revenuePerSale: 500,
      netPerSale: 442.5,
      breakEvenCac: 442.5,
      targetCac: 342.5,
      breakEvenRoas: 1.13,
      targetRoas: 1.46,
      breakEvenPurchases: 23,
      targetPurchases: 30,
    });
  });

  it('prefers the observed AOV over the list price', () => {
    expect(breakEven({ price: 500, aov: 650 })).toEqual({
      revenuePerSale: 650,
      netPerSale: 650,
      breakEvenCac: 650,
      targetCac: 650,
      breakEvenRoas: 1,
      targetRoas: 1,
      breakEvenPurchases: 0,
      targetPurchases: 0,
    });
    expect([breakEven({ price: 500, aov: 0 }).revenuePerSale, breakEven({ price: 500, aov: null }).revenuePerSale]).toEqual([500, 500]);
  });

  it('returns null ROAS and purchase targets when a sale cannot cover its costs', () => {
    expect(breakEven({ price: 100, paymentFeePct: 10, variableCostPerSale: 95, adSpend: 1000 })).toEqual({
      revenuePerSale: 100,
      netPerSale: -5,
      breakEvenCac: -5,
      targetCac: -5,
      breakEvenRoas: null,
      targetRoas: null,
      breakEvenPurchases: null,
      targetPurchases: null,
    });
    expect(breakEven({ price: 100, variableCostPerSale: 100, adSpend: 1000 })).toMatchObject({
      netPerSale: 0,
      breakEvenRoas: null,
      breakEvenPurchases: null,
    });
  });

  it('subtracts the desired margin from the target CAC', () => {
    expect(breakEven({ price: 100, variableCostPerSale: 70, desiredMarginPct: 40, adSpend: 900 })).toEqual({
      revenuePerSale: 100,
      netPerSale: 30,
      breakEvenCac: 30,
      targetCac: -10,
      breakEvenRoas: 3.33,
      targetRoas: null,
      breakEvenPurchases: 30,
      targetPurchases: null,
    });
  });
});

describe('ideaScores', () => {
  it('scores a fully rated idea', () => {
    const idea = {
      effort: 3,
      demonstrability: 8,
      repeatPotential: 6,
      legalRisk: 2,
      validation: { signals: { demand: { score: 8 }, marketplace: { score: 7 }, social: { score: 6 }, search: { score: 5 } } },
    };
    expect(ideaScores(idea)).toEqual({
      demand: 6.5,
      ease: 7,
      demonstrability: 8,
      repeat: 6,
      risk: 2,
      potential: 71,
      potentialLevel: 'high',
      difficultyLevel: 'low',
      riskLevel: 'low',
    });
  });

  it('clamps scores to 0-10 and averages only the rated parts', () => {
    const idea = { effort: 12, legalRisk: -3, validation: { signals: { demand: { score: 7 }, social: { score: null } } } };
    expect(ideaScores(idea)).toEqual({
      demand: 7,
      ease: 0,
      demonstrability: null,
      repeat: null,
      risk: 0,
      potential: 57,
      potentialLevel: 'medium',
      difficultyLevel: 'high',
      riskLevel: 'low',
    });
  });

  it('rounds demand to one decimal', () => {
    expect(ideaScores({ validation: { signals: { demand: { score: 7 }, social: { score: 8 }, search: { score: 8 } } } })).toMatchObject({
      demand: 7.7,
      potential: 77,
    });
  });

  it('returns nulls for an unrated idea', () => {
    expect(ideaScores({})).toEqual({
      demand: null,
      ease: null,
      demonstrability: null,
      repeat: null,
      risk: null,
      potential: null,
      potentialLevel: null,
      difficultyLevel: null,
      riskLevel: null,
    });
  });

  it('levels scores at 40% and 70% of the maximum', () => {
    expect([level(3.9), level(4), level(6.9), level(7), level(10), level(39, 100), level(40, 100), level(70, 100), level(null)]).toEqual([
      'low',
      'medium',
      'medium',
      'high',
      'high',
      'low',
      'medium',
      'high',
      null,
    ]);
  });
});

describe('pctChange', () => {
  it('returns the percent change rounded to one decimal', () => {
    expect([pctChange(150, 100), pctChange(50, 100), pctChange(1, 3), pctChange(0, 100)]).toEqual([50, -50, -66.7, -100]);
  });

  it('measures change against the magnitude of a negative base', () => {
    expect([pctChange(-50, -100), pctChange(-150, -100), pctChange(50, -100)]).toEqual([50, -50, 150]);
  });

  it('returns null without a usable base', () => {
    expect([pctChange(10, 0), pctChange(null, 5), pctChange(5, null), pctChange(5, undefined)]).toEqual([null, null, null, null]);
  });
});

describe('changedVariables', () => {
  it('lists changed variables in catalog order, ignoring case and whitespace', () => {
    const a = { price: 499, offer: 'Ebook', audience: 'Parents ', creative: 'UGC' };
    const b = { price: 499, offer: 'ebook', audience: 'parents', creative: 'Carousel', angle: 'Save time' };
    expect(changedVariables(a, b)).toEqual(['creative', 'angle']);
  });

  it('treats null, undefined and empty strings as equal but zero as a value', () => {
    expect(changedVariables({ offer: null, cta: '' }, { cta: undefined })).toEqual([]);
    expect(changedVariables({ price: 0 }, { price: null })).toEqual(['price']);
    expect(changedVariables({ price: 499 }, { price: 599, landingPage: 'v2' })).toEqual(['price', 'landingPage']);
  });

  it('handles missing experiments', () => {
    expect(changedVariables()).toEqual([]);
    expect(changedVariables(null, { price: 1 })).toEqual(['price']);
  });
});
