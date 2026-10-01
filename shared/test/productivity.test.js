import { describe, expect, it } from 'vitest';
import { blockSpan, blockState, carryOver, clockIn, goalPeriod, minutesToTime, timeToMinutes, weekdayOf } from '../src/dates.js';
import { countsTowardProgress, dayProgress, goalProgress, habitTarget, habitWeek } from '../src/metrics.js';
import {
  fieldErrors,
  goalProductsError,
  goalSchema,
  goalUpdateSchema,
  productivitySeriesQuery,
  pushSubscribeSchema,
  timeBlockSchema,
} from '../src/schemas.js';

describe('clock helpers', () => {
  it('converts between HH:mm and minutes, wrapping around midnight', () => {
    expect([timeToMinutes('00:00'), timeToMinutes('09:55'), timeToMinutes('23:59')]).toEqual([0, 595, 1439]);
    expect([minutesToTime(0), minutesToTime(595), minutesToTime(1500), minutesToTime(-30)]).toEqual(['00:00', '09:55', '01:00', '23:30']);
  });

  it('reads the wall clock of an instant in a timezone', () => {
    const instant = new Date('2026-09-29T19:00:00Z');
    expect(clockIn(instant, 'Asia/Kolkata')).toEqual({ date: '2026-09-30', minutes: 30, weekday: 3 });
    expect(clockIn(instant, 'America/New_York')).toEqual({ date: '2026-09-29', minutes: 900, weekday: 2 });
    expect(clockIn(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toEqual({ date: '2026-03-08', minutes: 210, weekday: 0 });
    expect([weekdayOf('2026-09-27'), weekdayOf('2026-09-28')]).toEqual([0, 1]);
  });

  it('spans overnight blocks into the next day', () => {
    expect(blockSpan({ start: '10:00', end: '12:30' })).toEqual({ from: 600, to: 750, minutes: 150 });
    expect(blockSpan({ start: '22:00', end: '01:00' })).toEqual({ from: 1320, to: 1500, minutes: 180 });
    expect(blockSpan({ start: '00:00', end: '23:59' }).minutes).toBe(1439);
  });

  it("places today's block before, during or after a time of day", () => {
    const money = { start: '10:00', end: '12:30' };
    expect([599, 600, 749, 750].map((m) => blockState(money, m))).toEqual(['upcoming', 'current', 'current', 'past']);
    const night = { start: '23:00', end: '01:00' };
    expect([30, 1379, 1380, 1439].map((m) => blockState(night, m))).toEqual(['upcoming', 'upcoming', 'current', 'current']);
  });

  it("counts the minutes left of yesterday's block that runs past midnight", () => {
    const night = { start: '23:00', end: '01:00' };
    expect([0, 30, 59, 60, 600].map((m) => carryOver(night, m))).toEqual([60, 30, 1, null, null]);
    expect(carryOver({ start: '22:30', end: '00:45' }, 15)).toBe(30);
    expect([carryOver({ start: '10:00', end: '12:30' }, 0), carryOver({ start: '22:00', end: '00:00' }, 0)]).toEqual([null, null]);
  });
});

describe('goal schemas', () => {
  const goal = { title: 'September revenue', level: 'monthly', category: 'money' };
  const LINK = 'Link at least one product to track this';
  const errors = (schema, value) => {
    const result = schema.safeParse(value);
    return result.success ? null : fieldErrors(result.error);
  };

  it('asks for a linked product when progress follows product results', () => {
    const unlinked = ['revenue', 'contribution', 'purchases'].map((tracking) => errors(goalSchema, { ...goal, tracking, productIds: [] }));
    expect(unlinked).toEqual([{ productIds: LINK }, { productIds: LINK }, { productIds: LINK }]);
    expect(errors(goalSchema, { ...goal, title: ' ', tracking: 'revenue' })).toEqual({ title: 'Title is required', productIds: LINK });
    expect(errors(goalSchema, { ...goal, tracking: 'revenue', productIds: ['507f1f77bcf86cd799439011'] })).toBeNull();
    expect([errors(goalSchema, goal), errors(goalSchema, { ...goal, tracking: 'focus_hours' })]).toEqual([null, null]);
  });

  it('checks the same rule on a whole goal and keeps updates partial', () => {
    expect(goalProductsError({ tracking: 'purchases', productIds: [] })).toBe(LINK);
    const fine = [{ tracking: 'revenue', productIds: ['x'] }, { tracking: 'manual' }, {}];
    expect(fine.map(goalProductsError)).toEqual([null, null, null]);
    expect(goalUpdateSchema.parse({ tracking: 'revenue' })).toEqual({ tracking: 'revenue' });
    expect(errors(goalUpdateSchema, { tracking: 'likes' })).toEqual({ tracking: 'Choose a valid option' });
  });
});

describe('goalProgress', () => {
  it('returns the share of the target, clamped to 0-100 with one decimal', () => {
    const cases = [
      [800, 1600],
      [584, 1000],
      [2, 3],
      [1500, 1000],
      [-50, 1000],
    ];
    expect(cases.map(([current, target]) => goalProgress(current, target))).toEqual([50, 58.4, 66.7, 100, 0]);
  });

  it('is null without a positive target or a current value', () => {
    const cases = [
      [5, null],
      [5, 0],
      [null, 10],
      [undefined, 10],
    ];
    expect(cases.map(([current, target]) => goalProgress(current, target))).toEqual([null, null, null, null]);
  });

  it('reports 100 only once the target is reached', () => {
    const cases = [
      [99960, 100000],
      [99950, 100000],
      [1999, 2000],
      [9995, 10000],
      [100000, 100000],
    ];
    expect(cases.map(([current, target]) => goalProgress(current, target))).toEqual([99.9, 99.9, 99.9, 99.9, 100]);
  });
});

describe('goal period and block progress', () => {
  it('runs a goal from its start (or creation day) to its target date or today, whichever is first', () => {
    expect(goalPeriod({ startDate: '2026-09-01', targetDate: '2026-09-30' }, '2026-10-05', 'Asia/Kolkata')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(goalPeriod({ startDate: null, targetDate: null, createdAt: '2026-09-14T20:00:00Z' }, '2026-09-29', 'Asia/Kolkata')).toEqual({
      from: '2026-09-15',
      to: '2026-09-29',
    });
  });

  it('leaves breaks out of block progress', () => {
    expect(['business', 'break', 'review'].map((category) => countsTowardProgress({ category }))).toEqual([true, false, true]);
  });
});

describe('habit weeks', () => {
  const week = (target, pattern, days = 7) => {
    const steps = habitWeek(target, days, [...pattern].map((c) => c === 'x'));
    return { done: steps.map((s) => s.done).join(''), possible: steps.map((s) => s.possible).join('') };
  };

  it('credits check-ins up to the weekly target and counts a miss once the target is out of reach', () => {
    expect(week(4, '...xxxx')).toEqual({ done: '0001111', possible: '0001111' });
    expect(week(4, 'x......')).toEqual({ done: '1000000', possible: '1000111' });
    expect(week(4, 'xxxxxxx')).toEqual({ done: '1111000', possible: '1111000' });
    expect(week(7, 'xx.xx.x')).toEqual({ done: '1101101', possible: '1111111' });
  });

  it('only counts the misses that are already certain in a week in progress', () => {
    expect(week(4, '...')).toEqual({ done: '000', possible: '000' });
    expect(week(7, 'x.')).toEqual({ done: '10', possible: '11' });
  });

  it('prorates the target of a habit that started mid-week', () => {
    expect([habitTarget(5), habitTarget(7, 4), habitTarget(4, 4), habitTarget(1, 1)]).toEqual([5, 4, 3, 1]);
    expect(week(4, 'xxxx', 4)).toEqual({ done: '1110', possible: '1110' });
  });
});

describe('dayProgress', () => {
  it('averages the parts of the day that apply', () => {
    expect(dayProgress({ outcomeSet: true, outcomeDone: true, blocksDue: 4, blocksDone: 1, habitsTotal: 2, habitsDone: 1 })).toBe(58);
    expect(dayProgress({ outcomeSet: true, outcomeDone: false })).toBe(0);
    expect(dayProgress({ blocksDue: 2, blocksDone: 5 })).toBe(100);
    expect(dayProgress({ habitsTotal: 3, habitsDone: 2 })).toBe(67);
  });

  it('is null when nothing is planned', () => {
    expect(dayProgress({})).toBeNull();
    expect(dayProgress()).toBeNull();
  });
});

describe('time block reminders', () => {
  const errors = (block) => {
    const result = timeBlockSchema.safeParse({ name: 'Stand-up', ...block });
    return result.success ? null : fieldErrors(result.error);
  };

  it('keeps the before-end reminder inside the block', () => {
    const tooLong = { 'reminders.beforeEnd': 'Must be shorter than the block' };
    expect(errors({ start: '10:00', end: '10:10', reminders: { beforeEnd: 15 } })).toEqual(tooLong);
    expect(errors({ start: '10:00', end: '10:10', reminders: { beforeEnd: 10 } })).toEqual(tooLong);
    expect(errors({ start: '23:50', end: '00:10', reminders: { beforeEnd: 20 } })).toEqual(tooLong);
    expect(errors({ start: '10:00', end: '10:10', reminders: { beforeEnd: 9 } })).toBeNull();
    expect(errors({ start: '23:50', end: '00:10', reminders: { beforeEnd: 15, beforeStart: null } })).toBeNull();
    expect(errors({ start: '10:00', end: '10:10', reminders: { beforeEnd: null } })).toBeNull();
  });
});

describe('productivitySeriesQuery', () => {
  const errors = (query) => {
    const result = productivitySeriesQuery.safeParse(query);
    return result.success ? null : fieldErrors(result.error);
  };

  it('accepts ranges of up to ten years and focus filters', () => {
    expect(errors({ from: '2016-09-30', to: '2026-09-29' })).toBeNull();
    expect(errors({ goalId: '507f1f77bcf86cd799439011', productId: '507f1f77bcf86cd799439012' })).toBeNull();
    expect(errors({ from: '2026-09-29', to: '2026-09-29' })).toBeNull();
  });

  it('rejects longer or reversed ranges and malformed ids', () => {
    expect(errors({ from: '2000-01-01', to: '2026-09-29' })).toEqual({ from: 'Choose a range of at most 10 years' });
    expect(errors({ from: '2026-09-29', to: '2026-09-01' })).toEqual({ to: 'End date is before the start date' });
    expect(errors({ goalId: 'abc' })).toEqual({ goalId: 'Invalid id' });
  });
});

describe('pushSubscribeSchema', () => {
  const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' };
  const endpointError = (endpoint) => {
    const result = pushSubscribeSchema.safeParse({ subscription: { endpoint, keys } });
    return result.success ? null : fieldErrors(result.error)['subscription.endpoint'];
  };

  it('accepts the major push services', () => {
    const endpoints = [
      'https://fcm.googleapis.com/fcm/send/a',
      'https://updates.push.services.mozilla.com/wpush/v2/a',
      'https://wns2-par02p.notify.windows.com/w/?token=a',
      'https://web.push.apple.com/a',
    ];
    expect(endpoints.map(endpointError)).toEqual([null, null, null, null]);
  });

  it('rejects other hosts, plain http and malformed endpoints without throwing', () => {
    const endpoints = [
      'https://push.example.com/a',
      'https://fcm.googleapis.com.example.com/a',
      'http://fcm.googleapis.com/a',
      'not a url',
    ];
    expect(endpoints.map(endpointError)).toEqual(['Unsupported push service', 'Unsupported push service', 'Invalid URL', 'Invalid URL']);
  });

  it('takes an optional background sync flag', () => {
    const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/a', keys };
    expect(pushSubscribeSchema.parse({ subscription, sync: true }).sync).toBe(true);
    expect(pushSubscribeSchema.safeParse({ subscription, sync: 'yes' }).success).toBe(false);
  });
});
