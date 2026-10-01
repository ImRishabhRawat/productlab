const DAY = 86_400_000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}

export const toUTCDate = (iso) => new Date(`${iso}T00:00:00.000Z`);
export const fromUTCDate = (date) => new Date(date).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromUTCDate(toUTCDate(iso).getTime() + n * DAY);
export const daysBetween = (from, to) => Math.round((toUTCDate(to) - toUTCDate(from)) / DAY);

export function addMonths(iso, n) {
  const d = toUTCDate(iso);
  return fromUTCDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

const partsCache = new Map();
function zonedParts(date, timeZone) {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(date).map(({ type, value }) => [type, value]));
  return { year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second };
}

export function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isoDateIn(date, timeZone) {
  const p = zonedParts(new Date(date), timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export const todayIn = (timeZone) => isoDateIn(new Date(), timeZone);

function offsetMs(instant, timeZone) {
  const p = zonedParts(new Date(instant), timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant / 1000) * 1000;
}

export function startOfDayIn(iso, timeZone) {
  const guess = toUTCDate(iso).getTime();
  let instant = guess - offsetMs(guess, timeZone);
  const corrected = guess - offsetMs(instant, timeZone);
  if (corrected !== instant && isoDateIn(corrected, timeZone) === iso) instant = corrected;
  return new Date(instant);
}

export function zonedInstant(iso, minutes, timeZone) {
  const wall = toUTCDate(iso).getTime() + minutes * 60_000;
  const before = offsetMs(wall - 15 * 3_600_000, timeZone);
  const after = offsetMs(wall + 15 * 3_600_000, timeZone);
  const fits = (offset) => offsetMs(wall - offset, timeZone) === offset;
  if (fits(before)) return wall - before;
  if (fits(after)) return wall - after;
  let lo = wall - after;
  let hi = wall - before;
  while (hi - lo > 60_000) {
    const mid = lo + Math.max(Math.floor((hi - lo) / 120_000), 1) * 60_000;
    if (offsetMs(mid, timeZone) === after) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function goalPeriod(goal, today, timeZone) {
  const from = goal.startDate ?? isoDateIn(goal.createdAt, timeZone);
  return { from, to: goal.targetDate && goal.targetDate < today ? goal.targetDate : today };
}

export function resolveRange(preset, today, custom = {}) {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'all':
      return { from: null, to: null };
    case 'custom': {
      const { from, to } = custom;
      if (isISODate(from) && isISODate(to)) return from <= to ? { from, to } : { from: to, to: from };
      return { from: addDays(today, -29), to: today };
    }
    default:
      return { from: addDays(today, -29), to: today };
  }
}

export function previousRange({ from, to }) {
  if (!from || !to) return null;
  const length = daysBetween(from, to) + 1;
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

export function autoGranularity({ from, to }) {
  if (!from || !to) return 'week';
  const days = daysBetween(from, to) + 1;
  return days <= 45 ? 'day' : days <= 180 ? 'week' : 'month';
}

export function fitGranularity({ from, to }, granularity, maxBuckets = 750) {
  const days = daysBetween(from, to) + 1;
  if (granularity === 'day' && days > maxBuckets) granularity = 'week';
  if (granularity === 'week' && days / 7 > maxBuckets) granularity = 'month';
  return granularity;
}

export function bucketStart(iso, granularity) {
  if (granularity === 'month') return `${iso.slice(0, 8)}01`;
  if (granularity === 'week') return addDays(iso, -((toUTCDate(iso).getUTCDay() + 6) % 7));
  return iso;
}

export function nextBucket(key, granularity) {
  if (granularity === 'month') return addMonths(key, 1);
  return addDays(key, granularity === 'week' ? 7 : 1);
}

export function bucketRange(from, to, granularity, limit = 2000) {
  const keys = [];
  const end = bucketStart(to, granularity);
  for (let k = bucketStart(from, granularity); k <= end && keys.length < 100000; k = nextBucket(k, granularity)) {
    keys.push(k);
  }
  return keys.slice(-limit);
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export const weekdayOf = (iso) => toUTCDate(iso).getUTCDay();

export function clockIn(date, timeZone) {
  const p = zonedParts(new Date(date), timeZone);
  const iso = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  return { date: iso, minutes: p.hour * 60 + p.minute, weekday: weekdayOf(iso) };
}

export function blockSpan({ start, end }) {
  const from = timeToMinutes(start);
  let to = timeToMinutes(end);
  if (to <= from) to += 1440;
  return { from, to, minutes: to - from };
}

export function blockState(block, minutes) {
  const { from, to } = blockSpan(block);
  if (minutes >= to) return 'past';
  return minutes >= from ? 'current' : 'upcoming';
}

export function carryOver(block, minutes) {
  const left = blockSpan(block).to - 1440 - minutes;
  return left > 0 ? left : null;
}
