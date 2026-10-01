import { todayIn } from '@product-lab/shared/dates';
import Setting from '../models/Setting.js';

let cache = null;
const options = { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true, runValidators: true };

export async function getSettings() {
  cache ??= await Setting.findOneAndUpdate({ key: 'app' }, { $setOnInsert: { key: 'app' } }, options).lean();
  return cache;
}

export async function updateSettings(patch) {
  cache = await Setting.findOneAndUpdate({ key: 'app' }, { $set: patch }, options).lean();
  return cache;
}

export async function timezone() {
  return (await getSettings()).timezone;
}

export async function today() {
  return todayIn(await timezone());
}

export async function productDefaults() {
  const s = await getSettings();
  return {
    costs: {
      paymentFeePct: s.defaultPaymentFeePct,
      refundRatePct: s.defaultRefundRatePct,
      variableCostPerSale: s.defaultVariableCostPerSale,
    },
    desiredMarginPct: s.defaultDesiredMarginPct,
  };
}
