import crypto from 'node:crypto';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { credentialStamp } from '../src/middleware/auth.js';
import { ADMIN, MISSING_ID as ID, anon, api, login, setupApi } from './setup.js';

setupApi();

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (payload, options = {}, secret = process.env.JWT_SECRET) => jwt.sign(payload, secret, { algorithm: 'HS256', ...options });
const sessionToken = async () => (await login()).split('=')[1];

function editPayload(token) {
  const [header, , signature] = token.split('.');
  return `${header}.${b64({ sub: 'intruder@test.local', v: credentialStamp() })}.${signature}`;
}

const ANALYTICS = 'summary timeseries products experiments creatives lifecycle scaling graveyard orders customers activity'.split(' ');

const PROTECTED = [
  ['get', '/auth/me'],
  ['get', '/settings'],
  ['patch', '/settings'],
  ['get', '/ideas'],
  ['post', '/ideas'],
  ['get', `/ideas/${ID}`],
  ['patch', `/ideas/${ID}`],
  ['delete', `/ideas/${ID}`],
  ['post', `/ideas/${ID}/convert`],
  ['get', '/products'],
  ['post', '/products'],
  ['get', `/products/${ID}`],
  ['patch', `/products/${ID}`],
  ['get', `/products/${ID}/timeline`],
  ['post', `/products/${ID}/events`],
  ['delete', `/products/${ID}/events/${ID}`],
  ['get', `/products/${ID}/versions`],
  ['post', `/products/${ID}/versions`],
  ['delete', `/products/${ID}/versions/${ID}`],
  ['get', '/experiments'],
  ['post', '/experiments'],
  ['get', `/experiments/${ID}`],
  ['patch', `/experiments/${ID}`],
  ['delete', `/experiments/${ID}`],
  ['get', '/creatives'],
  ['post', '/creatives'],
  ['patch', `/creatives/${ID}`],
  ['delete', `/creatives/${ID}`],
  ['get', '/metrics'],
  ['post', '/metrics'],
  ['patch', `/metrics/${ID}`],
  ['delete', `/metrics/${ID}`],
  ['get', '/decisions'],
  ['post', '/decisions'],
  ['patch', `/decisions/${ID}`],
  ['delete', `/decisions/${ID}`],
  ['get', '/customers'],
  ['post', '/customers'],
  ['get', `/customers/${ID}`],
  ['patch', `/customers/${ID}`],
  ['delete', `/customers/${ID}`],
  ['get', '/orders'],
  ['post', '/orders'],
  ['get', `/orders/${ID}`],
  ['patch', `/orders/${ID}`],
  ['delete', `/orders/${ID}`],
  ...ANALYTICS.map((name) => ['get', `/analytics/${name}`]),
  ['get', '/ai/status'],
  ['post', '/ai/analyze'],
  ['get', '/ai/analyses'],
  ['get', `/ai/analyses/${ID}`],
  ['delete', `/ai/analyses/${ID}`],
  ['get', '/unknown-route'],
];

const MALFORMED = [
  ['get', '/ideas/123'],
  ['patch', '/ideas/123'],
  ['delete', '/ideas/123'],
  ['post', '/ideas/123/convert'],
  ['get', '/products/abc'],
  ['patch', '/products/abc'],
  ['get', '/products/abc/timeline'],
  ['post', '/products/abc/events'],
  ['delete', `/products/${ID}/events/nope`],
  ['get', '/products/abc/versions'],
  ['post', '/products/abc/versions'],
  ['delete', `/products/${ID}/versions/nope`],
  ['get', '/experiments/zzz'],
  ['patch', '/experiments/zzz'],
  ['delete', '/experiments/zzz'],
  ['patch', '/creatives/zzz'],
  ['delete', '/creatives/zzz'],
  ['patch', '/metrics/zzz'],
  ['delete', '/metrics/zzz'],
  ['patch', '/decisions/zzz'],
  ['delete', '/decisions/zzz'],
  ['get', '/customers/zzz'],
  ['patch', '/customers/zzz'],
  ['delete', '/customers/zzz'],
  ['get', '/orders/zzz'],
  ['patch', '/orders/zzz'],
  ['delete', '/orders/zzz'],
  ['get', '/ai/analyses/zzz'],
  ['delete', '/ai/analyses/zzz'],
  ['get', `/ideas/${ID}x`],
];

describe('login', () => {
  it('sets an http-only session cookie and ignores email case', async () => {
    const res = await anon('post', '/auth/login').send({ email: ' ADMIN@Test.local ', password: ADMIN.password });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'admin@test.local' });
    const [cookie] = res.headers['set-cookie'];
    expect(cookie).toMatch(/^pl_session=[\w-]+\.[\w-]+\.[\w-]+;/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=604800');
  });

  it('rejects a wrong password or email', async () => {
    for (const body of [{ ...ADMIN, password: 'wrong-password' }, { ...ADMIN, email: 'someone@test.local' }]) {
      const res = await anon('post', '/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { message: 'Invalid email or password' } });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });

  it('validates the body', async () => {
    const res = await anon('post', '/auth/login').send({ email: ADMIN.email });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Please fix the highlighted fields', fields: { password: 'Required' } } });
  });
});

describe('session', () => {
  it('returns the signed-in admin', async () => {
    const res = await api.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ email: 'admin@test.local' });
  });

  it('accepts a fresh cookie from login', async () => {
    const cookie = await login();
    expect((await anon('get', '/auth/me').set('Cookie', cookie)).status).toBe(200);
  });

  it('clears the cookie on logout', async () => {
    const res = await anon('post', '/auth/logout');
    expect(res.status).toBe(204);
    expect(res.headers['set-cookie'][0]).toMatch(/^pl_session=;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

  it.each([
    ['garbage', () => 'not-a-token'],
    ['an edited payload', editPayload],
    ['a foreign secret', () => sign({ sub: ADMIN.email, v: credentialStamp() }, {}, 'another-secret-that-is-long-enough-for-hs256')],
    ['a stale credential stamp', () => sign({ sub: ADMIN.email, v: 'stale' })],
    ['an expired token', () => sign({ sub: ADMIN.email, v: credentialStamp() }, { expiresIn: -60 })],
    ['an unsigned token', () => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: ADMIN.email, v: credentialStamp() })}.`],
  ])('rejects %s', async (_, forge) => {
    const res = await anon('get', '/auth/me').set('Cookie', `pl_session=${forge(await sessionToken())}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { message: 'Session expired' } });
  });

  it('stamps the session with a secret-keyed credential hash', async () => {
    const { v } = jwt.decode(await sessionToken());
    expect(v).toBe(credentialStamp());
    expect(crypto.createHash('sha256').update(`${ADMIN.email}:${ADMIN.password}`).digest('hex')).not.toContain(v);
    const secret = config.jwtSecret;
    try {
      config.jwtSecret = 'another-secret-that-is-long-enough-for-hs256';
      expect(credentialStamp()).not.toBe(v);
    } finally {
      config.jwtSecret = secret;
    }
  });

  it('expires sessions when the admin password changes', async () => {
    const cookie = await login();
    const password = config.adminPassword;
    try {
      config.adminPassword = 'a-different-password';
      const res = await anon('get', '/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: { message: 'Session expired' } });
    } finally {
      config.adminPassword = password;
    }
    expect((await anon('get', '/auth/me').set('Cookie', cookie)).status).toBe(200);
  });
});

describe('route protection', () => {
  let tampered;

  beforeAll(async () => {
    tampered = `pl_session=${editPayload(await sessionToken())}`;
  });

  it.each(PROTECTED)('%s %s requires a valid session', async (method, path) => {
    const missing = await anon(method, path);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: { message: 'Not signed in' } });
    const forged = await anon(method, path).set('Cookie', tampered);
    expect(forged.status).toBe(401);
    expect(forged.body).toEqual({ error: { message: 'Session expired' } });
  });

  it('does not apply writes without a session', async () => {
    await anon('post', '/ideas').send({ name: 'Sneaky idea' });
    await anon('patch', '/settings').send({ currency: 'USD' });
    expect((await api.get('/ideas')).body.items).toEqual([]);
    expect((await api.get('/settings')).body.currency).toBe('INR');
  });
});

describe('error responses', () => {
  it.each(MALFORMED)('%s %s returns 404 for a malformed id', async (method, path) => {
    const res = await api[method](path);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Resource not found' } });
  });

  it('returns 404 for unknown API routes', async () => {
    const res = await api.get('/unknown-route');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { message: 'Not found' } });
  });

  it('returns validation errors with a message and field messages', async () => {
    const res = await api.post('/ideas', { name: '', effort: 20 });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { message: 'Please fix the highlighted fields', fields: { name: 'Name is required', effort: 'Must be at most 10' } },
    });
  });

  it('rejects invalid query filters', async () => {
    const res = await api.get('/ideas?status=done');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Invalid filters', fields: { status: 'Choose a valid option' } } });
  });

  it('rejects malformed JSON', async () => {
    const res = await api.post('/ideas').set('Content-Type', 'application/json').send('{"name":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Invalid JSON body' } });
  });

  it('rejects bodies over 1 MB', async () => {
    const res = await api.post('/ideas', { name: 'Huge', notes: 'x'.repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { message: 'Request is too large' } });
  });

  const json = 'application/json';
  it.each([
    ['an unsupported charset', { 'Content-Type': `${json}; charset=latin1` }, 415, 'Unsupported request encoding'],
    ['an unsupported encoding', { 'Content-Type': json, 'Content-Encoding': 'compress' }, 415, 'Unsupported request encoding'],
    ['a corrupt gzip body', { 'Content-Type': json, 'Content-Encoding': 'gzip' }, 400, 'Invalid request body'],
  ])('rejects %s as a client error without logging it', async (_, headers, status, message) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await anon('post', '/auth/login').set(headers).send(JSON.stringify(ADMIN));
      expect(res.status).toBe(status);
      expect(res.body).toEqual({ error: { message } });
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });
});

describe.runIf(fs.existsSync(new URL('../../frontend/dist/index.html', import.meta.url)))('production web app', () => {
  let web;

  beforeAll(() => {
    config.isProd = true;
    try {
      web = createApp();
    } finally {
      config.isProd = false;
    }
  });

  it('serves the app shell for page navigations and a 404 for missing static files', async () => {
    const page = await request(web).get('/today').set('Accept', 'text/html');
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    for (const path of ['/assets/OldChunk-deadbeef.js', '/assets/old.css', '/icon-999.png']) {
      const res = await request(web).get(path).set('Accept', '*/*');
      expect([path, res.status]).toEqual([path, 404]);
    }
    expect((await request(web).get('/manifest.webmanifest')).status).toBe(200);
  });
});

describe('sign-in throttling', () => {
  it('blocks sign-in after repeated failures', async () => {
    let res;
    for (let i = 0; i < 12 && res?.status !== 429; i += 1) {
      res = await anon('post', '/auth/login').send({ ...ADMIN, password: 'wrong-password' });
    }
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { message: 'Too many sign-in attempts. Try again in 15 minutes.' } });
    expect((await anon('post', '/auth/login').send(ADMIN)).status).toBe(429);
  });
});
