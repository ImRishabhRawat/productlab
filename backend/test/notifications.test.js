import webpush from 'web-push';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config.js';
import Notification from '../src/models/Notification.js';
import NotificationPreference from '../src/models/NotificationPreference.js';
import Order from '../src/models/Order.js';
import PushSubscription from '../src/models/PushSubscription.js';
import { notify, preferences } from '../src/services/notify.js';
import { tick } from '../src/services/scheduler.js';
import { ADMIN, MISSING_ID as ID, NOW, anon, api, create, createProduct, setNow, setupApi } from './setup.js';

vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() } }));

setupApi();
beforeAll(() => Notification.init());
afterEach(() => setNow(NOW));

const OTHER = 'other@test.local';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' };
const fieldError = (fields) => ({ error: { message: 'Please fix the highlighted fields', fields } });
const subscribe = (endpoint, body = {}, ua = ANDROID) =>
  api.post('/push/subscribe', { subscription: { endpoint, expirationTime: null, keys: KEYS }, ...body }).set('User-Agent', ua);
const titles = async (query = '') => (await api.get(`/notifications?${query}`)).body.items.map((n) => n.title);

const DEFAULT_PREFS = {
  enabled: true,
  blockReminder: true,
  blockStart: true,
  blockEnd: true,
  dailyOutcome: true,
  dailyOutcomeTime: '08:00',
  dailyReview: true,
  dailyReviewTime: '22:00',
  weeklyReview: true,
  weeklyReviewDay: 0,
  weeklyReviewTime: '19:00',
  habitReminders: false,
  habitReminderTime: '20:00',
  focusEnd: true,
  quietHours: true,
  quietStart: '23:00',
  quietEnd: '06:00',
  business: {
    newOrder: false,
    refund: false,
    conversionDrop: false,
    experimentMilestone: false,
    goalReached: false,
    dailyRevenue: false,
    dailyRevenueTime: '21:30',
    adSpendThreshold: false,
  },
};

const ROUTES = [
  ['get', '/goals'],
  ['post', '/goals'],
  ['get', `/goals/${ID}`],
  ['patch', `/goals/${ID}`],
  ['delete', `/goals/${ID}`],
  ['get', '/time-blocks'],
  ['post', '/time-blocks'],
  ['patch', `/time-blocks/${ID}`],
  ['delete', `/time-blocks/${ID}`],
  ['get', '/daily-outcomes'],
  ['get', '/daily-outcomes/2026-09-29'],
  ['put', '/daily-outcomes/2026-09-29'],
  ['get', '/focus-sessions'],
  ['post', '/focus-sessions'],
  ['patch', `/focus-sessions/${ID}`],
  ['delete', `/focus-sessions/${ID}`],
  ['get', '/habits'],
  ['get', '/habits/completions'],
  ['post', '/habits'],
  ['patch', `/habits/${ID}`],
  ['delete', `/habits/${ID}`],
  ['put', `/habits/${ID}/completions/2026-09-29`],
  ['delete', `/habits/${ID}/completions/2026-09-29`],
  ['get', '/reviews/daily'],
  ['get', '/reviews/daily/2026-09-29'],
  ['put', '/reviews/daily/2026-09-29'],
  ['get', '/reviews/weekly'],
  ['put', '/reviews/weekly/2026-09-28'],
  ['get', '/productivity/today'],
  ['get', '/productivity/series'],
  ['get', '/notifications'],
  ['get', '/notifications/unread-count'],
  ['post', '/notifications/read-all'],
  ['post', `/notifications/${ID}/read`],
  ['delete', `/notifications/${ID}`],
  ['get', '/notification-preferences'],
  ['patch', '/notification-preferences'],
  ['get', '/push/key'],
  ['post', '/push/subscribe'],
  ['post', '/push/unsubscribe'],
  ['get', '/push/devices'],
  ['delete', `/push/devices/${ID}`],
  ['post', '/push/test'],
];

describe('route protection', () => {
  it.each(ROUTES)('%s %s requires a session', async (method, path) => {
    const res = await anon(method, path);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Not signed in' } });
  });

  it('does not apply writes without a session', async () => {
    await anon('post', '/goals').send({ title: 'Sneaky', level: 'monthly', category: 'money' });
    await anon('patch', '/notification-preferences').send({ enabled: false });
    await anon('post', '/push/subscribe').send({ subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: KEYS } });
    expect((await api.get('/goals')).body.items).toEqual([]);
    expect((await api.get('/notification-preferences')).body.enabled).toBe(true);
    expect(await PushSubscription.countDocuments()).toBe(0);
  });
});

describe('cross-site request protection', () => {
  it.each([
    ['post', '/notifications/read-all'],
    ['patch', '/notification-preferences'],
    ['put', '/daily-outcomes/2026-09-29'],
    ['delete', `/push/devices/${ID}`],
  ])('blocks a cross-site %s %s', async (method, path) => {
    for (const site of ['cross-site', 'same-site']) {
      const res = await api[method](path, {}).set('Sec-Fetch-Site', site);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: { message: 'Cross-site request blocked' } });
    }
  });

  it('does not apply a blocked write', async () => {
    await api.patch('/notification-preferences', { dailyReviewTime: '21:00' }).set('Sec-Fetch-Site', 'cross-site');
    expect((await api.get('/notification-preferences')).body.dailyReviewTime).toBe('22:00');
  });

  it('allows same-origin writes, cross-site reads and clients without the header', async () => {
    const sameOrigin = await api.patch('/notification-preferences', { dailyReviewTime: '21:00' }).set('Sec-Fetch-Site', 'same-origin');
    expect(sameOrigin.body.dailyReviewTime).toBe('21:00');
    expect((await api.get('/notification-preferences').set('Sec-Fetch-Site', 'cross-site')).status).toBe(200);
    expect((await api.patch('/notification-preferences', { dailyReviewTime: '22:00' })).body.dailyReviewTime).toBe('22:00');
  });

  it('blocks a cross-site sign-in', async () => {
    const res = await anon('post', '/auth/login').set('Sec-Fetch-Site', 'cross-site').send(ADMIN);
    expect(res.status).toBe(403);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});

describe('notification center', () => {
  let foreign;

  beforeAll(async () => {
    await api.patch('/notification-preferences', { business: { refund: true } });
    setNow('2026-09-29T04:25:00.000Z');
    await notify({
      category: 'schedule',
      type: 'block_reminder',
      title: 'Money Block starts in 5 min',
      url: '/today',
      dedupeKey: 'block:a:2026-09-29:before',
    });
    setNow('2026-09-29T05:00:00.000Z');
    await notify({ category: 'business', type: 'refund', title: 'Refund · ₹500', body: 'Planner · Refunded', url: '/orders' });
    setNow('2026-09-29T06:00:00.000Z');
    await notify({ category: 'review', type: 'daily_review', title: 'Daily Review', url: '/today?review=1' });
    foreign = await Notification.create({ owner: OTHER, category: 'system', type: 'test', title: 'Not yours' });
  });

  it("lists the owner's notifications newest first with the unread count", async () => {
    const res = await api.get('/notifications');
    expect(res.status).toBe(200);
    expect(res.body.unread).toBe(3);
    expect(res.body.items.map((n) => n.title)).toEqual(['Daily Review', 'Refund · ₹500', 'Money Block starts in 5 min']);
    expect(res.body.items[2]).toEqual({
      _id: expect.any(String),
      category: 'schedule',
      type: 'block_reminder',
      title: 'Money Block starts in 5 min',
      body: '',
      url: '/today',
      readAt: null,
      pushed: { sent: 0, failed: 0, skipped: 'not_configured' },
      createdAt: '2026-09-29T04:25:00.000Z',
      updatedAt: expect.any(String),
    });
    expect((await api.get('/notifications/unread-count')).body).toEqual({ unread: 3 });
  });

  it('filters by category, limit and cursor', async () => {
    expect(await titles('category=business')).toEqual(['Refund · ₹500']);
    expect(await titles('limit=2')).toEqual(['Daily Review', 'Refund · ₹500']);
    expect(await titles('before=2026-09-29T05:00:00.000Z')).toEqual(['Money Block starts in 5 min']);
    expect((await api.get('/notifications?limit=101')).body).toEqual({
      error: { message: 'Invalid filters', fields: { limit: 'Must be at most 100' } },
    });
    expect((await api.get('/notifications?category=spam')).status).toBe(400);
  });

  it('marks notifications read one at a time or all at once', async () => {
    const { items } = (await api.get('/notifications')).body;
    const refund = items.find((n) => n.type === 'refund');
    expect((await api.post(`/notifications/${refund._id}/read`)).body).toEqual({ unread: 2 });
    expect((await api.post(`/notifications/${refund._id}/read`)).body).toEqual({ unread: 2 });
    expect((await api.get('/notifications')).body.items.find((n) => n._id === refund._id).readAt).toBe(NOW);
    expect(await titles('unread=true')).toEqual(['Daily Review', 'Money Block starts in 5 min']);
    expect((await api.post('/notifications/read-all')).body).toEqual({ unread: 0 });
    expect((await api.get('/notifications?unread=true')).body).toEqual({ items: [], unread: 0 });
    expect((await Notification.findById(foreign._id).lean()).readAt).toBeNull();
  });

  it("keeps other owners' notifications out of reach", async () => {
    const id = String(foreign._id);
    expect((await api.get('/notifications')).body.items.map((n) => n._id)).not.toContain(id);
    for (const res of [await api.post(`/notifications/${id}/read`), await api.delete(`/notifications/${id}`)]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { message: 'Notification not found' } });
    }
    expect(await Notification.exists({ _id: id })).toBeTruthy();
    expect((await api.post(`/notifications/${ID}/read`)).status).toBe(404);
    expect((await api.delete('/notifications/nope')).body).toEqual({ error: { message: 'Resource not found' } });
  });

  it('deletes a notification', async () => {
    const [latest] = (await api.get('/notifications')).body.items;
    expect((await api.delete(`/notifications/${latest._id}`)).status).toBe(204);
    expect((await api.delete(`/notifications/${latest._id}`)).status).toBe(404);
    expect(await titles()).toEqual(['Refund · ₹500', 'Money Block starts in 5 min']);
  });

  it('keeps a deleted alert from coming back and out of the unread count', async () => {
    const alert = { category: 'schedule', type: 'block_start', title: 'Lunch walk starts now', dedupeKey: 'block:w:2026-09-29:start' };
    const sent = await notify(alert);
    expect((await api.get('/notifications/unread-count')).body).toEqual({ unread: 1 });
    expect((await api.delete(`/notifications/${sent._id}`)).status).toBe(204);
    expect((await api.get('/notifications/unread-count')).body).toEqual({ unread: 0 });
    expect(await notify(alert)).toBeNull();
    expect(await titles()).toEqual(['Refund · ₹500', 'Money Block starts in 5 min']);
    expect((await api.post(`/notifications/${sent._id}/read`)).status).toBe(404);
  });
});

describe('notification preferences', () => {
  beforeEach(() => NotificationPreference.deleteMany({}));

  it('creates the defaults on first read', async () => {
    const res = await api.get('/notification-preferences');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...DEFAULT_PREFS, owner: ADMIN.email });
    await api.get('/notification-preferences');
    expect(await NotificationPreference.countDocuments()).toBe(1);
  });

  it('applies partial changes, including single business alerts', async () => {
    const changes = { blockEnd: false, quietStart: '22:30' };
    const res = await api.patch('/notification-preferences', { ...changes, business: { newOrder: true, dailyRevenueTime: '20:00' } });
    expect(res.status).toBe(200);
    const business = { ...DEFAULT_PREFS.business, newOrder: true, dailyRevenueTime: '20:00' };
    expect(res.body).toMatchObject({ ...DEFAULT_PREFS, ...changes, business });
    const next = await api.patch('/notification-preferences', { business: { refund: true } });
    expect(next.body.business).toEqual({ ...business, refund: true });
    const saved = (await api.get('/notification-preferences')).body;
    expect(saved).toMatchObject({ ...DEFAULT_PREFS, ...changes, business: { ...business, refund: true } });
  });

  it('reads saved preferences without writing them', async () => {
    await api.get('/notification-preferences');
    const created = await NotificationPreference.findOne().lean();
    setNow('2026-09-29T08:00:00.000Z');
    await api.get('/notification-preferences');
    await preferences();
    expect((await NotificationPreference.findOne().lean()).updatedAt).toEqual(created.updatedAt);
  });

  it('ignores the owner and unknown keys', async () => {
    const res = await api.patch('/notification-preferences', { owner: 'intruder@test.local', enabled: false, colour: 'red' });
    expect(res.body).toMatchObject({ owner: ADMIN.email, enabled: false });
    expect(res.body).not.toHaveProperty('colour');
    expect(await NotificationPreference.countDocuments({ owner: 'intruder@test.local' })).toBe(0);
  });

  it.each([
    [{ weeklyReviewDay: 7 }, { weeklyReviewDay: 'Must be at most 6' }],
    [{ quietStart: '7pm' }, { quietStart: 'Use a 24-hour HH:MM time' }],
    [{ enabled: 'yes' }, { enabled: 'Invalid value' }],
    [
      { business: { dailyRevenueTime: '25:00', refund: 1 } },
      { 'business.refund': 'Invalid value', 'business.dailyRevenueTime': 'Use a 24-hour HH:MM time' },
    ],
  ])('rejects %o and keeps the saved preferences', async (body, fields) => {
    const res = await api.patch('/notification-preferences', body);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(fieldError(fields));
    expect((await api.get('/notification-preferences')).body).toMatchObject(DEFAULT_PREFS);
  });
});

describe('push without VAPID keys', () => {
  it('reports push as not configured and still keeps the notification', async () => {
    expect((await api.get('/push/key')).body).toEqual({ configured: false, publicKey: null });
    expect((await api.post('/push/test')).body).toEqual({ pushed: { sent: 0, failed: 0, skipped: 'not_configured' } });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect((await api.get('/notifications?limit=1')).body.items[0]).toMatchObject({
      category: 'system',
      type: 'test',
      title: 'Product Lab notifications are on',
      url: '/settings',
      pushed: { skipped: 'not_configured' },
    });
  });
});

describe('push devices', () => {
  beforeAll(() => PushSubscription.deleteMany({}));

  it('registers a device for the signed-in owner, never the one in the body', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';
    const res = await subscribe(endpoint, { owner: 'intruder@test.local' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ _id: expect.any(String), active: true });
    expect(await PushSubscription.findById(res.body._id).lean()).toMatchObject({
      owner: ADMIN.email,
      endpoint,
      keys: KEYS,
      label: 'Chrome on Android',
      userAgent: ANDROID,
      active: true,
      failures: 0,
    });
  });

  it.each([
    ['an unknown push service', 'https://push.example.com/send/1', 'Unsupported push service'],
    ['a look-alike host', 'https://fcm.googleapis.com.example.com/send/1', 'Unsupported push service'],
    ['plain http', 'http://fcm.googleapis.com/fcm/send/1', 'Invalid URL'],
    ['a malformed endpoint', 'not a url', 'Invalid URL'],
  ])('rejects %s', async (_, endpoint, message) => {
    const res = await subscribe(endpoint);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(fieldError({ 'subscription.endpoint': message }));
  });

  it('requires the subscription keys', async () => {
    const res = await api.post('/push/subscribe', { subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/no-keys' } });
    expect(res.body).toEqual(fieldError({ 'subscription.keys': 'Required' }));
  });

  it('updates an existing endpoint instead of duplicating it', async () => {
    const endpoint = 'https://web.push.apple.com/device-2';
    const first = await subscribe(endpoint, {}, IPHONE);
    expect(await PushSubscription.findById(first.body._id).lean()).toMatchObject({ label: 'Safari on iPhone' });
    await PushSubscription.updateOne({ _id: first.body._id }, { $set: { active: false, failures: 4 } });
    setNow('2026-09-29T07:00:00.000Z');
    const keys = { p256dh: 'BOtherKeyMaterialForTheSameEndpoint', auth: 'anotherAuthSecret' };
    const again = await api.post('/push/subscribe', { subscription: { endpoint, keys }, label: 'My iPhone' }).set('User-Agent', IPHONE);
    expect(again.body).toEqual({ _id: first.body._id, active: true });
    expect(await PushSubscription.findById(first.body._id).lean()).toMatchObject({
      keys,
      label: 'My iPhone',
      active: true,
      failures: 0,
      lastSeenAt: new Date('2026-09-29T07:00:00.000Z'),
    });
    expect(await PushSubscription.countDocuments({ endpoint })).toBe(1);
  });

  it("lists only the owner's devices without their keys", async () => {
    await PushSubscription.create({ owner: OTHER, endpoint: 'https://fcm.googleapis.com/fcm/send/other', keys: KEYS });
    const res = await api.get('/push/devices');
    expect(res.body.configured).toBe(false);
    expect(res.body.items.map((d) => d.label)).toEqual(['My iPhone', 'Chrome on Android']);
    expect(Object.keys(res.body.items[0]).sort()).toEqual([
      '_id',
      'active',
      'createdAt',
      'endpoint',
      'failures',
      'label',
      'lastSeenAt',
      'lastSuccessAt',
      'userAgent',
    ]);
  });

  it("unsubscribes and removes only the owner's devices", async () => {
    const other = await PushSubscription.findOne({ owner: OTHER }).lean();
    expect((await api.post('/push/unsubscribe', { endpoint: other.endpoint })).status).toBe(204);
    const removed = await api.delete(`/push/devices/${other._id}`);
    expect(removed.status).toBe(404);
    expect(removed.body).toEqual({ error: { message: 'Device not found' } });
    expect(await PushSubscription.exists({ _id: other._id })).toBeTruthy();
    const [phone, android] = (await api.get('/push/devices')).body.items;
    expect((await api.post('/push/unsubscribe', { endpoint: phone.endpoint })).status).toBe(204);
    expect((await api.delete(`/push/devices/${android._id}`)).status).toBe(204);
    expect((await api.delete(`/push/devices/${android._id}`)).status).toBe(404);
    expect((await api.get('/push/devices')).body.items).toEqual([]);
    expect((await api.post('/push/unsubscribe', {})).body).toEqual(fieldError({ endpoint: 'Required' }));
  });

  it('keeps a removed device out when it syncs in the background, until it is enabled on purpose', async () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';
    const gone = { error: { message: 'This device is no longer registered. Enable notifications on it to add it again.' } };
    const sync = await subscribe(endpoint, { sync: true });
    expect(sync.status).toBe(410);
    expect(sync.body).toEqual(gone);
    expect(await PushSubscription.findOne({ endpoint }).lean()).toMatchObject({ active: false, removedAt: expect.any(Date) });
    expect((await api.get('/push/devices')).body.items).toEqual([]);
    const unknown = await subscribe('https://fcm.googleapis.com/fcm/send/never-registered', { sync: true });
    expect([unknown.status, await PushSubscription.countDocuments({ endpoint: /never-registered/ })]).toEqual([410, 0]);

    const enabled = await subscribe(endpoint);
    expect(enabled.status).toBe(201);
    expect((await api.get('/push/devices')).body.items.map((d) => [d.endpoint, d.active])).toEqual([[endpoint, true]]);
    setNow('2026-09-29T09:00:00.000Z');
    const seen = await subscribe(endpoint, { sync: true });
    expect([seen.status, seen.body]).toEqual([200, { _id: enabled.body._id, active: true }]);
    expect(await PushSubscription.findById(enabled.body._id).lean()).toMatchObject({
      removedAt: null,
      lastSeenAt: new Date('2026-09-29T09:00:00.000Z'),
    });
  });
});

describe('device limit', () => {
  const endpoint = (name) => `https://fcm.googleapis.com/fcm/send/${name}`;
  const hoursAgo = (h) => new Date(Date.parse(NOW) - h * 3_600_000);
  const active = async (name) => (await PushSubscription.findOne({ endpoint: endpoint(name) }).lean()).active;
  const activeCount = () => PushSubscription.countDocuments({ owner: ADMIN.email, active: true });

  beforeAll(async () => {
    await PushSubscription.deleteMany({});
    const seen = Array.from({ length: 20 }, (_, i) => ({
      owner: ADMIN.email,
      endpoint: endpoint(`seen-${i + 1}h-ago`),
      keys: KEYS,
      lastSeenAt: hoursAgo(i + 1),
    }));
    await PushSubscription.insertMany([
      ...seen,
      { owner: ADMIN.email, endpoint: endpoint('retired'), keys: KEYS, active: false, lastSeenAt: hoursAgo(1) },
      { owner: OTHER, endpoint: endpoint('foreign'), keys: KEYS, lastSeenAt: hoursAgo(100) },
    ]);
  });

  it('keeps at most 20 active devices, retiring the least recently seen', async () => {
    expect((await subscribe(endpoint('new-phone'))).status).toBe(201);
    expect(await activeCount()).toBe(20);
    expect([await active('new-phone'), await active('seen-20h-ago'), await active('seen-19h-ago')]).toEqual([true, false, true]);
    expect([await active('retired'), await active('foreign')]).toEqual([false, true]);
  });

  it('leaves the others alone when a known device checks in, and makes room when a retired one comes back', async () => {
    expect((await subscribe(endpoint('seen-19h-ago'))).status).toBe(201);
    expect(await activeCount()).toBe(20);
    expect(await active('seen-18h-ago')).toBe(true);
    expect((await subscribe(endpoint('retired'))).status).toBe(201);
    expect(await activeCount()).toBe(20);
    expect([await active('retired'), await active('seen-18h-ago'), await active('seen-17h-ago')]).toEqual([true, false, true]);
  });
});

describe('push delivery', () => {
  const saved = { ...config.vapid };
  const devices = {};
  const ping = (title) => notify({ category: 'system', type: 'test', title });
  const sent = () =>
    webpush.sendNotification.mock.calls.map(([target, body, options]) => ({ endpoint: target.endpoint, ...JSON.parse(body), options }));
  const failWith = (statusCodes) =>
    webpush.sendNotification.mockImplementation(async ({ endpoint }) => {
      const statusCode = statusCodes[endpoint];
      if (statusCode) throw Object.assign(new Error('Push failed'), { statusCode });
      return { statusCode: 201 };
    });

  beforeAll(async () => {
    Object.assign(config.vapid, { publicKey: 'BTestPublicKey', privateKey: 'test-private-key', subject: 'mailto:admin@test.local' });
    await NotificationPreference.deleteMany({});
  });
  afterAll(() => Object.assign(config.vapid, saved));
  beforeEach(async () => {
    webpush.sendNotification.mockReset();
    failWith({});
    await PushSubscription.deleteMany({});
    const add = (owner, name, extra) =>
      PushSubscription.create({ owner, endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: KEYS, ...extra });
    devices.laptop = await add(ADMIN.email, 'laptop');
    devices.phone = await add(ADMIN.email, 'phone');
    devices.retired = await add(ADMIN.email, 'retired', { active: false });
    devices.foreign = await add(OTHER, 'foreign');
  });

  it('publishes the key and sends to every active device of the owner', async () => {
    expect((await api.get('/push/key')).body).toEqual({ configured: true, publicKey: 'BTestPublicKey' });
    const result = await notify({
      category: 'schedule',
      type: 'block_start',
      title: 'Money Block starts now',
      body: "Today's priority: Launch",
      url: '/today',
      dedupeKey: 'block:m:2026-09-29:start',
      urgency: 'high',
    });
    expect(result.pushed).toEqual({ sent: 2, failed: 0, skipped: '' });
    expect(webpush.setVapidDetails).toHaveBeenCalledWith('mailto:admin@test.local', 'BTestPublicKey', 'test-private-key');
    expect(sent().map((p) => p.endpoint).sort()).toEqual([devices.laptop.endpoint, devices.phone.endpoint]);
    expect(sent()[0]).toEqual({
      endpoint: expect.any(String),
      id: String(result._id),
      title: 'Money Block starts now',
      body: "Today's priority: Launch",
      url: '/today',
      category: 'schedule',
      tag: 'block:m:2026-09-29:start',
      unread: await Notification.countDocuments({ owner: ADMIN.email, readAt: null }),
      options: { TTL: 14400, urgency: 'high', timeout: 10000 },
    });
    expect((await Notification.findById(result._id).lean()).pushed).toEqual({ sent: 2, failed: 0, skipped: '' });
    expect((await PushSubscription.findById(devices.laptop._id).lean()).lastSuccessAt).toEqual(new Date(NOW));
    expect((await api.get('/push/devices')).body.items).toHaveLength(3);
  });

  it('deactivates devices the push service reports as gone', async () => {
    failWith({ [devices.laptop.endpoint]: 410, [devices.phone.endpoint]: 404 });
    expect((await ping('Ping')).pushed).toEqual({ sent: 0, failed: 2, skipped: '' });
    expect(await PushSubscription.countDocuments({ owner: ADMIN.email, active: true })).toBe(0);
    expect((await ping('Ping again')).pushed).toEqual({ sent: 0, failed: 0, skipped: 'no_devices' });
    expect(await PushSubscription.countDocuments({ owner: OTHER, active: true })).toBe(1);
  });

  it('keeps a device through an outage and retires it after days without a delivered push', async () => {
    const outage = [
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      Object.assign(new Error('Service unavailable'), { statusCode: 503 }),
    ];
    let calls = 0;
    webpush.sendNotification.mockImplementation(async ({ endpoint }) => {
      if (endpoint !== devices.laptop.endpoint) return { statusCode: 201 };
      calls += 1;
      throw outage[calls % 2];
    });
    for (let failures = 1; failures <= 6; failures += 1) {
      expect((await ping(`Ping ${failures}`)).pushed).toEqual({ sent: 1, failed: 1, skipped: '' });
      expect(await PushSubscription.findById(devices.laptop._id).lean()).toMatchObject({ active: true, failures });
    }
    setNow('2026-10-02T06:31:00.000Z');
    await ping('Ping three days later');
    expect(await PushSubscription.findById(devices.laptop._id).lean()).toMatchObject({ active: false, failures: 7 });
    expect(await PushSubscription.findById(devices.phone._id).lean()).toMatchObject({ active: true, failures: 0 });
  });

  it('resets the failure count after a successful push', async () => {
    await PushSubscription.updateOne({ _id: devices.phone._id }, { $set: { failures: 3 } });
    await ping('Ping');
    expect((await PushSubscription.findById(devices.phone._id).lean()).failures).toBe(0);
  });

  it('sends and stores nothing while notifications are switched off', async () => {
    await api.patch('/notification-preferences', { enabled: false });
    try {
      const before = await Notification.countDocuments();
      expect(await notify({ category: 'schedule', type: 'block_start', title: 'Money Block starts now' })).toBeNull();
      expect((await api.post('/push/test')).body).toEqual({ pushed: { sent: 0, failed: 0, skipped: 'disabled' } });
      expect(webpush.sendNotification).not.toHaveBeenCalled();
      expect(await Notification.countDocuments()).toBe(before);
    } finally {
      await api.patch('/notification-preferences', { enabled: true });
    }
  });

  it('skips a notification type that is switched off', async () => {
    await api.patch('/notification-preferences', { business: { refund: false, conversionDrop: true } });
    try {
      expect(await notify({ category: 'business', type: 'refund', title: 'Refund' })).toBeNull();
      expect((await notify({ category: 'business', type: 'conversion_drop', title: 'Conversion fell' })).pushed.sent).toBe(2);
    } finally {
      await api.patch('/notification-preferences', { business: { conversionDrop: false } });
    }
  });

  it('answers order and metric requests without waiting for a push service that never replies', async () => {
    webpush.sendNotification.mockImplementation(() => new Promise(() => {}));
    await api.patch('/notification-preferences', { business: { refund: true, experimentMilestone: true } });
    try {
      const product = await createProduct({ name: 'Stalled push' });
      const order = { productId: product._id, customer: { email: 'stall@example.com' }, items: [{ kind: 'main', amount: 199 }] };
      const res = await api.post('/orders', { ...order, date: '2026-09-29', refundStatus: 'full' }).timeout(5000);
      expect(res.status).toBe(201);
      expect(await Order.countDocuments({ productId: product._id })).toBe(1);
      const experiment = await create('/experiments', { productId: product._id, name: 'Stalled test' });
      const metric = await api.post('/metrics', { experimentId: experiment._id, date: '2026-09-29', purchases: 12 }).timeout(5000);
      expect(metric.status).toBe(201);
      const alerts = await Notification.find({ title: { $in: ['Refund · ₹199', 'Stalled test crossed 10 purchases'] } }).lean();
      expect(alerts.map((n) => n.type).sort()).toEqual(['experiment_milestone', 'refund']);
    } finally {
      await api.patch('/notification-preferences', { business: { refund: false, experimentMilestone: false } });
    }
  });

  it('gives time-bound reminders a short lifetime and high urgency', async () => {
    const reminders = { beforeStart: 5, beforeEnd: 5 };
    const block = await create('/time-blocks', { name: 'Focus Block', start: '10:00', end: '12:30', reminders });
    const pushedAt = async (time) => {
      webpush.sendNotification.mockClear();
      await tick(new Date(`2026-10-01T${time}:00+05:30`));
      return [...new Map(sent().map((p) => [p.title, p.options]))];
    };
    const options = (TTL, urgency = 'high') => ({ TTL, urgency, timeout: 10000 });
    try {
      expect(await pushedAt('08:00')).toEqual([["Set today's #1 outcome", options(57600, 'normal')]]);
      expect(await pushedAt('09:55')).toEqual([['Focus Block starts in 5 min', options(300)]]);
      expect(await pushedAt('10:00')).toEqual([['Focus Block starts now', options(900)]]);
      expect(await pushedAt('12:25')).toEqual([['Focus Block ends in 5 min', options(300)]]);
      setNow('2026-10-01T14:00:00+05:30');
      const session = await create('/focus-sessions', { plannedMinutes: 25 });
      expect(await pushedAt('14:25')).toEqual([['Focus session complete', options(900)]]);
      await api.delete(`/focus-sessions/${session._id}`);
    } finally {
      await api.delete(`/time-blocks/${block._id}`);
    }
  });

  it('keeps notifications in the app during quiet hours without pushing them', async () => {
    setNow('2026-09-29T18:00:00.000Z');
    const quiet = await notify({ category: 'schedule', type: 'block_start', title: 'Night launch starts now' });
    expect(quiet.pushed).toEqual({ sent: 0, failed: 0, skipped: 'quiet_hours' });
    expect((await Notification.findById(quiet._id).lean()).pushed.skipped).toBe('quiet_hours');
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    expect((await api.post('/push/test')).body).toEqual({ pushed: { sent: 2, failed: 0, skipped: '' } });
    setNow('2026-09-30T00:30:00.000Z');
    expect((await notify({ category: 'schedule', type: 'block_start', title: 'Morning starts now' })).pushed.sent).toBe(2);
  });

  it('checks quiet hours at the given instant in the configured timezone', async () => {
    const at = (iso) => notify({ category: 'schedule', type: 'block_start', title: `At ${iso}`, now: new Date(iso) });
    expect((await at('2026-09-29T17:25:00.000Z')).pushed.skipped).toBe('');
    expect((await at('2026-09-29T17:35:00.000Z')).pushed.skipped).toBe('quiet_hours');
    expect((await at('2026-09-30T00:25:00.000Z')).pushed.skipped).toBe('quiet_hours');
    await api.patch('/notification-preferences', { quietHours: false });
    expect((await at('2026-09-29T18:00:00.000Z')).pushed.skipped).toBe('');
    await api.patch('/notification-preferences', { quietHours: true });
  });
});
