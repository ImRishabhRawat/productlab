import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  addMonths,
  autoGranularity,
  bucketRange,
  bucketStart,
  daysBetween,
  isISODate,
  isoDateIn,
  isValidTimeZone,
  nextBucket,
  previousRange,
  resolveRange,
  startOfDayIn,
  todayIn,
  zonedInstant,
} from '../src/dates.js';

const TODAY = '2026-09-29';

describe('calendar arithmetic', () => {
  it('adds days across month, year and leap-day boundaries', () => {
    expect([addDays('2026-02-28', 1), addDays('2028-02-28', 1), addDays('2026-01-01', -1), addDays('2026-09-29', -89)]).toEqual([
      '2026-03-01',
      '2028-02-29',
      '2025-12-31',
      '2026-07-02',
    ]);
  });

  it('counts days and moves to the first of later months', () => {
    expect([daysBetween('2026-01-01', '2026-12-31'), daysBetween('2026-09-29', '2026-09-01')]).toEqual([364, -28]);
    expect([addMonths('2026-12-15', 1), addMonths('2026-01-31', 1), addMonths('2026-03-10', -3)]).toEqual([
      '2027-01-01',
      '2026-02-01',
      '2025-12-01',
    ]);
  });
});

describe('resolveRange', () => {
  it('resolves presets relative to today', () => {
    expect(resolveRange('today', TODAY)).toEqual({ from: TODAY, to: TODAY });
    expect(resolveRange('7d', TODAY)).toEqual({ from: '2026-09-23', to: TODAY });
    expect(resolveRange('30d', TODAY)).toEqual({ from: '2026-08-31', to: TODAY });
    expect(resolveRange('90d', TODAY)).toEqual({ from: '2026-07-02', to: TODAY });
    expect(resolveRange('all', TODAY)).toEqual({ from: null, to: null });
    expect(resolveRange('7d', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
  });

  it('keeps or swaps a valid custom range', () => {
    expect(resolveRange('custom', TODAY, { from: '2026-09-01', to: '2026-09-10' })).toEqual({ from: '2026-09-01', to: '2026-09-10' });
    expect(resolveRange('custom', TODAY, { from: '2026-09-10', to: '2026-09-01' })).toEqual({ from: '2026-09-01', to: '2026-09-10' });
  });

  it('falls back to the last 30 days for invalid input', () => {
    const last30 = { from: '2026-08-31', to: TODAY };
    expect(resolveRange('custom', TODAY, { from: '2026-02-30', to: '2026-03-01' })).toEqual(last30);
    expect(resolveRange('custom', TODAY)).toEqual(last30);
    expect(resolveRange('bogus', TODAY)).toEqual(last30);
  });
});

describe('previousRange', () => {
  it('returns the period of equal length right before the range', () => {
    expect(previousRange({ from: '2026-09-01', to: '2026-09-29' })).toEqual({ from: '2026-08-03', to: '2026-08-31' });
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-01-29', to: '2026-02-28' });
    expect(previousRange({ from: '2026-01-01', to: '2026-01-01' })).toEqual({ from: '2025-12-31', to: '2025-12-31' });
  });

  it('returns null for open ranges', () => {
    expect(previousRange({ from: null, to: null })).toBeNull();
    expect(previousRange({ from: '2026-09-01' })).toBeNull();
  });
});

describe('buckets', () => {
  it('starts weeks on Monday and months on the first', () => {
    expect(bucketStart(TODAY, 'day')).toBe(TODAY);
    expect([bucketStart('2026-09-28', 'week'), bucketStart(TODAY, 'week'), bucketStart('2026-10-04', 'week')]).toEqual([
      '2026-09-28',
      '2026-09-28',
      '2026-09-28',
    ]);
    expect([bucketStart('2026-01-01', 'week'), bucketStart('2026-03-01', 'week')]).toEqual(['2025-12-29', '2026-02-23']);
    expect([bucketStart(TODAY, 'month'), bucketStart('2026-12-31', 'month')]).toEqual(['2026-09-01', '2026-12-01']);
  });

  it('steps to the next bucket', () => {
    expect([nextBucket('2026-12-31', 'day'), nextBucket('2025-12-29', 'week'), nextBucket('2026-12-01', 'month')]).toEqual([
      '2027-01-01',
      '2026-01-05',
      '2027-01-01',
    ]);
  });

  it('lists every bucket touched by a range', () => {
    expect(bucketRange('2026-02-27', '2026-03-02', 'day')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(bucketRange('2025-12-24', '2026-01-08', 'week')).toEqual(['2025-12-22', '2025-12-29', '2026-01-05']);
    expect(bucketRange('2025-11-15', '2026-02-10', 'month')).toEqual(['2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01']);
    expect(bucketRange('2026-09-10', '2026-09-01', 'day')).toEqual([]);
  });

  it('picks a granularity from the range length', () => {
    expect([
      autoGranularity({ from: '2026-01-01', to: '2026-02-14' }),
      autoGranularity({ from: '2026-01-01', to: '2026-02-15' }),
      autoGranularity({ from: '2026-01-01', to: '2026-06-29' }),
      autoGranularity({ from: '2026-01-01', to: '2026-06-30' }),
      autoGranularity({ from: null, to: null }),
    ]).toEqual(['day', 'week', 'week', 'month', 'week']);
  });
});

describe('time zones', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds the start of a day in Asia/Kolkata', () => {
    expect(startOfDayIn(TODAY, 'Asia/Kolkata').toISOString()).toBe('2026-09-28T18:30:00.000Z');
    expect(startOfDayIn('2026-01-01', 'Asia/Kolkata').toISOString()).toBe('2025-12-31T18:30:00.000Z');
    expect(startOfDayIn(TODAY, 'UTC').toISOString()).toBe('2026-09-29T00:00:00.000Z');
  });

  it('finds the start of a day around New York DST changes', () => {
    expect(startOfDayIn('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(startOfDayIn('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    expect(startOfDayIn('2026-11-01', 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(startOfDayIn('2026-11-02', 'America/New_York').toISOString()).toBe('2026-11-02T05:00:00.000Z');
  });

  it.each([
    ['2026-09-29', 'Asia/Kolkata'],
    ['2026-03-08', 'America/New_York'],
    ['2026-11-01', 'America/New_York'],
    ['2026-04-05', 'America/Santiago'],
    ['2026-09-06', 'America/Santiago'],
    ['2026-03-08', 'America/Havana'],
    ['2026-03-29', 'Asia/Beirut'],
    ['2026-10-04', 'Australia/Lord_Howe'],
    ['2026-09-27', 'Pacific/Chatham'],
  ])('starts %s in %s at the first instant of that local day', (iso, timeZone) => {
    const start = startOfDayIn(iso, timeZone);
    expect(isoDateIn(start, timeZone)).toBe(iso);
    expect(isoDateIn(start.getTime() - 1, timeZone)).toBe(addDays(iso, -1));
  });

  it('reads the calendar date of an instant in a zone', () => {
    expect(isoDateIn('2026-09-28T18:30:00.000Z', 'Asia/Kolkata')).toBe('2026-09-29');
    expect(isoDateIn('2026-09-28T18:29:59.999Z', 'Asia/Kolkata')).toBe('2026-09-28');
    expect(isoDateIn(new Date('2026-03-08T04:59:59.000Z'), 'America/New_York')).toBe('2026-03-07');
    expect(isoDateIn(Date.UTC(2026, 2, 8, 5), 'America/New_York')).toBe('2026-03-08');
    expect(isoDateIn('2026-11-01T04:30:00.000Z', 'America/New_York')).toBe('2026-11-01');
  });

  it('reads today in the configured zone', () => {
    vi.useFakeTimers({ now: new Date('2026-09-28T19:00:00.000Z'), toFake: ['Date'] });
    expect(todayIn('Asia/Kolkata')).toBe('2026-09-29');
    expect(todayIn('America/New_York')).toBe('2026-09-28');
  });

  it('finds the instant of a wall-clock time, also before midnight and after it', () => {
    const at = (iso, minutes, timeZone) => new Date(zonedInstant(iso, minutes, timeZone)).toISOString();
    expect(at(TODAY, 600, 'Asia/Kolkata')).toBe('2026-09-29T04:30:00.000Z');
    expect(at(TODAY, -10, 'Asia/Kolkata')).toBe('2026-09-28T18:20:00.000Z');
    expect(at(TODAY, 1500, 'Asia/Kolkata')).toBe('2026-09-29T19:30:00.000Z');
  });

  it('moves a time skipped by DST to the first instant after the gap and takes the first of a repeated time', () => {
    const at = (iso, minutes, timeZone) => new Date(zonedInstant(iso, minutes, timeZone)).toISOString();
    expect([90, 145, 150, 180, 210].map((m) => at('2026-03-08', m, 'America/New_York'))).toEqual([
      '2026-03-08T06:30:00.000Z',
      '2026-03-08T07:00:00.000Z',
      '2026-03-08T07:00:00.000Z',
      '2026-03-08T07:00:00.000Z',
      '2026-03-08T07:30:00.000Z',
    ]);
    expect([90, 150].map((m) => at('2026-11-01', m, 'America/New_York'))).toEqual(['2026-11-01T05:30:00.000Z', '2026-11-01T07:30:00.000Z']);
    expect([90, 150].map((m) => at('2026-10-25', m, 'Europe/Berlin'))).toEqual(['2026-10-24T23:30:00.000Z', '2026-10-25T00:30:00.000Z']);
  });

  it('validates time zone names', () => {
    expect([isValidTimeZone('Asia/Kolkata'), isValidTimeZone('America/New_York'), isValidTimeZone('UTC')]).toEqual([true, true, true]);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
  });
});

describe('isISODate', () => {
  it('accepts real calendar dates only', () => {
    expect(['2026-02-28', '2028-02-29', '2000-02-29', '2026-12-31'].every(isISODate)).toBe(true);
    expect(['2026-02-29', '2100-02-29', '2026-04-31', '2026-13-01', '2026-00-10'].some(isISODate)).toBe(false);
  });

  it('rejects other formats and types', () => {
    expect(['2026-9-29', '2026-09-29T00:00:00Z', '29/09/2026', '', ' 2026-09-29'].some(isISODate)).toBe(false);
    expect([null, undefined, 20260929, new Date('2026-09-29')].some(isISODate)).toBe(false);
  });
});
