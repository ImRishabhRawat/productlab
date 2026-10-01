import { describe, expect, it } from 'vitest';
import { api, createProduct, setupApi } from './setup.js';

setupApi();

const DEFAULTS = {
  currency: 'INR',
  locale: 'en-IN',
  timezone: 'Asia/Kolkata',
  defaultPaymentFeePct: 2.5,
  defaultRefundRatePct: 0,
  defaultVariableCostPerSale: 0,
  defaultDesiredMarginPct: 20,
};

describe('settings', () => {
  it('returns the defaults and AI availability', async () => {
    const res = await api.get('/settings');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...DEFAULTS, ai: { enabled: expect.any(Boolean), model: expect.any(String) } });
  });

  it('saves normalized values and ignores unknown keys', async () => {
    const res = await api.patch('/settings', {
      currency: 'usd',
      locale: 'en-US',
      timezone: ' America/New_York ',
      defaultRefundRatePct: 5,
      key: 'other',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ...DEFAULTS,
      currency: 'USD',
      locale: 'en-US',
      timezone: 'America/New_York',
      defaultRefundRatePct: 5,
    });
    expect((await api.get('/settings')).body).toEqual(res.body);
  });

  it('accepts an empty patch', async () => {
    const before = (await api.get('/settings')).body;
    const res = await api.patch('/settings', {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual(before);
  });

  it.each([
    [{ timezone: 'Mars/Olympus' }, { timezone: 'Unknown timezone' }],
    [{ locale: 'zz-!!' }, { locale: 'Unknown locale' }],
    [{ currency: 'RUPEE' }, { currency: 'Use a 3-letter currency code' }],
    [{ defaultPaymentFeePct: 101 }, { defaultPaymentFeePct: 'Must be at most 100' }],
    [{ defaultVariableCostPerSale: -1 }, { defaultVariableCostPerSale: 'Must be at least 0' }],
  ])('rejects %o and keeps the saved settings', async (body, fields) => {
    const before = (await api.get('/settings')).body;
    const res = await api.patch('/settings', body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Please fix the highlighted fields', fields } });
    expect((await api.get('/settings')).body).toEqual(before);
  });

  it('applies default costs and margin to new products', async () => {
    await api.patch('/settings', { defaultPaymentFeePct: 3, defaultVariableCostPerSale: 12, defaultDesiredMarginPct: 30 });
    expect(await createProduct()).toMatchObject({
      costs: { paymentFeePct: 3, refundRatePct: 5, variableCostPerSale: 12 },
      desiredMarginPct: 30,
    });
    expect(await createProduct({ costs: { refundRatePct: 1 }, desiredMarginPct: 10 })).toMatchObject({
      costs: { paymentFeePct: 3, refundRatePct: 1, variableCostPerSale: 12 },
      desiredMarginPct: 10,
    });
  });
});
