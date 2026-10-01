import { describe, expect, it } from 'vitest';
import {
  convertIdeaSchema,
  creativeSchema,
  customerSchema,
  decisionSchema,
  decisionUpdateSchema,
  experimentSchema,
  experimentUpdateSchema,
  fieldErrors,
  ideaSchema,
  ideaUpdateSchema,
  metricSchema,
  metricUpdateSchema,
  orderSchema,
  orderUpdateSchema,
  productEventSchema,
  productSchema,
  productUpdateSchema,
  rangeQuery,
  settingsSchema,
  versionSchema,
} from '../src/schemas.js';

const ID = '507f1f77bcf86cd799439011';
const errors = (schema, value) => {
  const result = schema.safeParse(value);
  return result.success ? null : fieldErrors(result.error);
};

describe('required fields', () => {
  it('reports missing fields as Required', () => {
    expect(errors(ideaSchema, {})).toEqual({ name: 'Required' });
    expect(errors(productSchema, {})).toEqual({ name: 'Required', price: 'Required' });
    expect(errors(experimentSchema, {})).toEqual({ productId: 'Required', name: 'Required' });
    expect(errors(creativeSchema, {})).toEqual({ experimentId: 'Required', name: 'Required' });
    expect(errors(customerSchema, {})).toEqual({ email: 'Required' });
  });

  it('asks for the date format when a calendar date is missing', () => {
    expect(errors(metricSchema, {})).toEqual({ date: 'Use a YYYY-MM-DD date' });
    expect(errors(productEventSchema, {})).toEqual({ date: 'Use a YYYY-MM-DD date', title: 'Required' });
    expect(errors(decisionSchema, {})).toEqual({
      productId: 'Required',
      decision: 'Choose a valid option',
      reason: 'Required',
      date: 'Use a YYYY-MM-DD date',
    });
  });

  it('names the field when a required text is blank', () => {
    expect(errors(ideaSchema, { name: '   ' })).toEqual({ name: 'Name is required' });
    expect(errors(decisionSchema, { productId: ID, decision: 'kill', reason: ' ', date: '2026-09-01' })).toEqual({
      reason: 'Reason is required',
    });
    expect(errors(versionSchema, { label: '', date: '2026-09-01' })).toEqual({ label: 'Version is required' });
    expect(errors(productEventSchema, { title: '', date: '2026-09-01' })).toEqual({ title: 'Title is required' });
  });
});

describe('friendly messages', () => {
  it('explains numeric, enum and length problems', () => {
    const idea = { name: 'Planner', effort: 11, demonstrability: 2.5, repeatPotential: 'abc', expectedPrice: -1, status: 'converted' };
    expect(errors(ideaSchema, idea)).toEqual({
      effort: 'Must be at most 10',
      demonstrability: 'Enter a whole number',
      repeatPotential: 'Enter a number',
      expectedPrice: 'Must be at least 0',
      status: 'Choose a valid option',
    });
    expect(errors(ideaSchema, { name: 'x'.repeat(121) })).toEqual({ name: 'Use at most 120 characters' });
    expect(errors(metricSchema, { date: '2026-09-01', impressions: 1.5, spend: -1 })).toEqual({
      impressions: 'Enter a whole number',
      spend: 'Must be at least 0',
    });
    expect(errors(convertIdeaSchema, { status: 'scaling', price: -1 })).toEqual({
      status: 'Choose a valid option',
      price: 'Must be at least 0',
    });
  });

  it('keys nested problems by their path', () => {
    expect(errors(ideaSchema, { name: 'Planner', validation: { competitors: [{ name: '' }], priceExamples: [{ label: 'A' }] } })).toEqual({
      'validation.competitors.0.name': 'Name is required',
      'validation.priceExamples.0.price': 'Required',
    });
  });

  it('validates ids and emails', () => {
    expect(errors(experimentSchema, { productId: 'abc', name: 'Test' })).toEqual({ productId: 'Invalid id' });
    expect(errors(customerSchema, { email: 'nope' })).toEqual({ email: 'Invalid email' });
    expect(customerSchema.parse({ email: ' Foo@Example.COM ' })).toEqual({ email: 'foo@example.com' });
  });

  it('trims text input', () => {
    expect(ideaSchema.parse({ name: '  Planner  ', category: ' Templates ' })).toEqual({ name: 'Planner', category: 'Templates' });
  });
});

describe('update schemas', () => {
  it('keep only the provided keys without injecting defaults', () => {
    expect(ideaUpdateSchema.parse({ notes: 'x' })).toEqual({ notes: 'x' });
    expect(ideaUpdateSchema.parse({ validation: { audience: 'Parents' } })).toEqual({ validation: { audience: 'Parents' } });
    expect(productUpdateSchema.parse({ price: 10 })).toEqual({ price: 10 });
    expect(productUpdateSchema.parse({ costs: { refundRatePct: 5 } })).toEqual({ costs: { refundRatePct: 5 } });
    expect(experimentUpdateSchema.parse({ variables: { offer: 'Bundle' } })).toEqual({ variables: { offer: 'Bundle' } });
    expect(orderUpdateSchema.parse({ notes: 'n' })).toEqual({ notes: 'n' });
    expect(settingsSchema.parse({})).toEqual({});
  });

  it('drop fields that cannot be changed', () => {
    expect(experimentUpdateSchema.parse({ productId: ID, name: 'B' })).toEqual({ name: 'B' });
    expect(metricUpdateSchema.parse({ productId: ID, experimentId: ID, creativeId: ID, spend: 5 })).toEqual({ spend: 5 });
    expect(decisionUpdateSchema.parse({ decision: 'kill', productId: ID, notes: 'n' })).toEqual({ notes: 'n' });
  });
});

describe('orderSchema date', () => {
  const order = (date) => ({ productId: ID, customer: { email: 'a@b.co' }, items: [{ kind: 'main', amount: 499 }], date });

  it('accepts a calendar date or an ISO timestamp with an offset', () => {
    for (const date of ['2026-09-29', '2028-02-29', '2026-09-29T10:15:00+05:30', '2026-09-29T10:15:00Z']) {
      expect(orderSchema.safeParse(order(date)).success).toBe(true);
    }
  });

  it('rejects impossible dates and timestamps without an offset', () => {
    for (const date of ['2026-02-29', '2026-09-29T10:15:00', '29/09/2026', '']) {
      expect(orderSchema.safeParse(order(date)).success).toBe(false);
    }
  });

  it('explains a missing or malformed date like other date fields', () => {
    expect(errors(metricSchema, {}).date).toBe('Use a YYYY-MM-DD date');
    for (const date of [undefined, '', '29/09/2026', '2026-02-29']) {
      expect(errors(orderSchema, order(date))).toEqual({ date: 'Use a YYYY-MM-DD date' });
    }
  });

  it('requires at least one item', () => {
    expect(errors(orderSchema, { ...order('2026-09-29'), items: [] })).toEqual({ items: 'Add at least one item' });
    expect(errors(orderSchema, { ...order('2026-09-29'), items: [{ kind: 'gift', amount: 1 }] })).toEqual({
      'items.0.kind': 'Choose a valid option',
    });
  });
});

describe('settingsSchema', () => {
  it('normalizes valid settings', () => {
    expect(settingsSchema.parse({ timezone: ' America/New_York ', locale: 'en-US', currency: 'usd', defaultPaymentFeePct: 2.9 })).toEqual({
      timezone: 'America/New_York',
      locale: 'en-US',
      currency: 'USD',
      defaultPaymentFeePct: 2.9,
    });
  });

  it('rejects unknown time zones, locales and currencies', () => {
    expect(errors(settingsSchema, { timezone: 'Mars/Olympus', locale: 'zz-!!', currency: 'US', defaultRefundRatePct: 101 })).toEqual({
      timezone: 'Unknown timezone',
      locale: 'Unknown locale',
      currency: 'Use a 3-letter currency code',
      defaultRefundRatePct: 'Must be at most 100',
    });
  });
});

describe('rangeQuery', () => {
  it('splits and validates id lists', () => {
    expect(rangeQuery.parse({ ids: `${ID},` })).toEqual({ ids: [ID] });
    expect(errors(rangeQuery, { ids: `${ID},abc` })).toEqual({ 'ids.1': 'Invalid id' });
  });

  it('validates dates and granularity', () => {
    expect(errors(rangeQuery, { from: '2026-02-30', granularity: 'year' })).toEqual({
      from: 'Use a YYYY-MM-DD date',
      granularity: 'Choose a valid option',
    });
  });
});

describe('fieldErrors', () => {
  it('keeps the first message per path and keys root issues as _', () => {
    const issues = [
      { path: ['a'], message: 'first' },
      { path: ['a'], message: 'second' },
      { path: [], message: 'root' },
      { path: ['b', 0, 'c'], message: 'nested' },
    ];
    expect(fieldErrors({ issues })).toEqual({ a: 'first', _: 'root', 'b.0.c': 'nested' });
  });
});
