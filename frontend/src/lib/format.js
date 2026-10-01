import { METRICS } from '@product-lab/shared/constants';

const config = { currency: 'INR', locale: 'en-IN', timezone: 'Asia/Kolkata' };
const cache = new Map();
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const DASH = '—';

export function configureFormat(next) {
  Object.assign(config, next);
  cache.clear();
}

function memo(kind, options, create) {
  const key = kind + JSON.stringify(options);
  if (!cache.has(key)) cache.set(key, create());
  return cache.get(key);
}
const nf = (options) => memo('n', options, () => new Intl.NumberFormat(config.locale, options));
const df = (options) => memo('d', options, () => new Intl.DateTimeFormat(config.locale, options));
const valid = (v) => typeof v === 'number' && Number.isFinite(v);

export const currencySymbol = () =>
  nf({ style: 'currency', currency: config.currency })
    .formatToParts(0)
    .find((p) => p.type === 'currency')?.value ?? config.currency;

export function fmtCurrency(v, { compact = false, digits = 1 } = {}) {
  if (!valid(v)) return DASH;
  const abs = Math.abs(v);
  const currency = { style: 'currency', currency: config.currency };
  if (compact && abs >= 1000) return nf({ ...currency, notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: digits }).format(v);
  const fraction = Number.isInteger(v) || abs >= 1000 ? 0 : 2;
  return nf({ ...currency, minimumFractionDigits: fraction, maximumFractionDigits: fraction }).format(v);
}

export function fmtNumber(v, { compact = false, digits } = {}) {
  if (!valid(v)) return DASH;
  if (compact && Math.abs(v) >= 10000) return nf({ notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: digits ?? 1 }).format(v);
  return nf({ maximumFractionDigits: digits ?? 0 }).format(v);
}

export function fmtPercent(v, digits) {
  if (!valid(v)) return DASH;
  const abs = Math.abs(v);
  const d = digits ?? (abs && abs < 0.1 ? 3 : abs < 1 ? 2 : 1);
  return `${nf({ maximumFractionDigits: d }).format(v)}%`;
}

export const fmtRatio = (v) => (valid(v) ? `${v.toFixed(2)}x` : DASH);

export const plural = (n, word, many = `${word}s`) => `${fmtNumber(n)} ${n === 1 ? word : many}`;

export const truncate = (text = '', max = 26) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export const choices = (values, labels) => values.map((value) => ({ value, label: labels[value] ?? value }));

export function formatValue(format, v, options) {
  if (format === 'currency') return fmtCurrency(v, options);
  if (format === 'percent') return fmtPercent(v);
  if (format === 'ratio') return fmtRatio(v);
  if (format === 'hours') return options?.compact ? `${fmtNumber(v, { digits: 1 })}h` : fmtDuration(v * 60);
  return fmtNumber(v, options);
}

export const fmtMetric = (key, v, options) => formatValue(METRICS[key]?.format ?? 'number', v, options);

export const fmtTick = (format, v) => formatValue(format, v, { compact: true, digits: 2 });

export function fmtDelta(pct) {
  if (!valid(pct)) return DASH;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${nf({ maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 }).format(Math.abs(pct))}%`;
}

export function deltaTone(pct, better) {
  if (!valid(pct) || pct === 0 || !better) return 'neutral';
  return (pct > 0) === (better === 'up') ? 'positive' : 'negative';
}

function toDate(value) {
  if (typeof value === 'string' && ISO.test(value)) return { date: new Date(`${value}T00:00:00Z`), timeZone: 'UTC' };
  return { date: new Date(value), timeZone: config.timezone };
}

export function fmtDate(value, { year = false, weekday = false } = {}) {
  if (!value) return DASH;
  const { date, timeZone } = toDate(value);
  if (Number.isNaN(date.getTime())) return DASH;
  return df({ timeZone, day: '2-digit', month: 'short', ...(year && { year: 'numeric' }), ...(weekday && { weekday: 'short' }) }).format(date);
}

export function fmtDateTime(value) {
  if (!value) return DASH;
  return df({ timeZone: config.timezone, day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function fmtRelative(value) {
  if (!value) return DASH;
  const diff = (new Date(value).getTime() - Date.now()) / 1000;
  const rtf = memo('r', {}, () => new Intl.RelativeTimeFormat(config.locale, { numeric: 'auto' }));
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(value, { year: true });
}

export function fmtBucket(key, granularity, { long = false } = {}) {
  if (!key) return DASH;
  const date = new Date(`${key}T00:00:00Z`);
  if (granularity === 'month') return df({ timeZone: 'UTC', month: 'short', year: long ? 'numeric' : '2-digit' }).format(date);
  const label = df({ timeZone: 'UTC', day: '2-digit', month: 'short', ...(long && { year: 'numeric' }) }).format(date);
  return long && granularity === 'week' ? `Week of ${label}` : label;
}

export const fmtMonth = (iso) => df({ timeZone: 'UTC', month: 'short' }).format(new Date(`${iso}T00:00:00Z`));

export function fmtDuration(minutes) {
  if (!valid(minutes)) return DASH;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtRange({ from, to } = {}) {
  if (!from || !to) return 'All time';
  if (from === to) return fmtDate(from, { year: true });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmtDate(from, { year: !sameYear })} – ${fmtDate(to, { year: true })}`;
}
