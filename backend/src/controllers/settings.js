import { aiStatus } from '../services/ai/gemini.js';
import { getSettings, updateSettings } from '../services/settings.js';

const view = (s) => ({
  currency: s.currency,
  locale: s.locale,
  timezone: s.timezone,
  defaultPaymentFeePct: s.defaultPaymentFeePct,
  defaultRefundRatePct: s.defaultRefundRatePct,
  defaultVariableCostPerSale: s.defaultVariableCostPerSale,
  defaultDesiredMarginPct: s.defaultDesiredMarginPct,
  ai: aiStatus(),
});

export async function get(req, res) {
  res.json(view(await getSettings()));
}

export async function update(req, res) {
  res.json(view(await updateSettings(req.body)));
}
