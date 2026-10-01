const STEPS = [1, 2, 2.5, 5];

export function niceScale(values, { integer = false } = {}) {
  const finite = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!finite.length) return {};
  const min = Math.min(0, ...finite);
  const max = Math.max(0, ...finite);
  if (min === max) return { domain: [0, integer ? 4 : 1], ticks: integer ? [0, 1, 2, 3, 4] : [0, 0.25, 0.5, 0.75, 1] };
  const magnitude = Math.floor(Math.log10((max - min) / 4));
  let best = null;
  for (let e = magnitude - 1; e <= magnitude + 1; e++) {
    for (const m of STEPS) {
      const step = m * 10 ** e;
      if (integer && !Number.isInteger(step)) continue;
      const lo = Math.floor(min / step) * step;
      const hi = Math.ceil(max / step) * step;
      const intervals = Math.round((hi - lo) / step);
      if (intervals < 3 || intervals > 6) continue;
      if (!best || hi - lo < best.hi - best.lo || (hi - lo === best.hi - best.lo && intervals < best.intervals)) best = { lo, hi, step, intervals };
    }
  }
  if (!best) {
    const lo = Math.floor(min);
    const hi = Math.max(lo + 3, Math.ceil(max));
    best = { lo, hi, step: 1, intervals: hi - lo };
  }
  const ticks = Array.from({ length: best.intervals + 1 }, (_, i) => Number((best.lo + i * best.step).toFixed(10)));
  return { domain: [ticks[0], ticks.at(-1)], ticks };
}
