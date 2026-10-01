import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, beforeAll, vi } from 'vitest';

export const ADMIN = { email: 'admin@test.local', password: 'test-password' };
export const MISSING_ID = '507f1f77bcf86cd799439011';
export const NOW = '2026-09-29T06:30:00.000Z';

let mongo;
let app;
let cookie;

export function setupApi() {
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(NOW) });
    const { createApp } = await import('../src/app.js');
    app = createApp();
    cookie = await login();
  });
  afterAll(async () => {
    vi.useRealTimers();
    await mongoose.disconnect();
    await mongo?.stop();
  });
}

export async function login(credentials = ADMIN) {
  const res = await request(app).post('/api/auth/login').send(credentials);
  return res.headers['set-cookie']?.[0].split(';')[0];
}

export const anon = (method, path) => request(app)[method](`/api${path}`);

const call = (method) => (path, body) => {
  const req = anon(method, path).set('Cookie', cookie);
  return body === undefined ? req : req.send(body);
};

export const api = { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') };

export async function create(path, body) {
  const res = await api.post(path, body);
  if (res.status !== 201) throw new Error(`POST ${path} returned ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body;
}

export const createProduct = (body) => create('/products', { name: 'Test product', price: 499, ...body });
export const createExperiment = (productId, body) => create('/experiments', { productId, name: 'Test experiment', ...body });
export const createCreative = (experimentId, body) => create('/creatives', { experimentId, name: 'Test creative', ...body });

export async function resetDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

export const setNow = (iso) => vi.setSystemTime(new Date(iso));
