import { breakEven } from '@product-lab/shared/metrics';

export const productBreakEven = (product, totals) =>
  breakEven({ price: product?.price, aov: totals?.aov, ...product?.costs, desiredMarginPct: product?.desiredMarginPct, adSpend: totals?.spend });

export function standing(value, { target, limit }, lowerIsBetter) {
  if (value == null || !(limit > 0)) return null;
  const beats = (bound) => (lowerIsBetter ? value <= bound : value >= bound);
  if (target > 0 && beats(target)) return ['good', 'on target'];
  if (beats(limit)) return ['warning', lowerIsBetter ? 'under break-even' : 'above break-even'];
  return ['critical', lowerIsBetter ? 'above break-even' : 'below break-even'];
}
