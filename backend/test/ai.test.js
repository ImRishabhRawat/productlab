import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { NUMBER, STRING, generateJson, list, obj, oneOf } from '../src/services/ai/gemini.js';

const KEY = 'test-gemini-key';
const NOT_CONFIGURED = 'AI is not configured. Set GEMINI_API_KEY on the server.';
const schema = obj({
  summary: STRING,
  tags: list(STRING),
  range: obj({ min: NUMBER, max: NUMBER }),
  risks: list(obj({ risk: STRING, severity: oneOf(['low', 'medium', 'high']) })),
});

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const reply = (...parts) => json({ candidates: [{ content: { parts: parts.map((text) => ({ text })) }, finishReason: 'STOP' }] });
const stubFetch = (impl) => {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
};
const run = () => generateJson({ system: 'sys', prompt: 'data', schema });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  config.gemini.apiKey = '';
});

describe('generateJson', () => {
  beforeEach(() => {
    config.gemini.apiKey = KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('sends the key only in a header with a JSON schema request', async () => {
    const fetch = stubFetch(async () => reply('{"summary":"ok"}'));
    await run();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`);
    expect(init.headers['x-goog-api-key']).toBe(KEY);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(init.body);
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'sys' }] });
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'data' }] }]);
    expect(body.generationConfig).toEqual({ responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 });
    expect(body.generationConfig.responseSchema.properties.risks.items.required).toEqual(['risk', 'severity']);
  });

  it('joins text parts and normalizes the output leniently', async () => {
    stubFetch(async () =>
      reply(
        '{"summary":"  Strong demand ",',
        '"risks":[{"risk":"Refunds","severity":"HIGH"},{"risk":"","severity":"low"},{"risk":"Ad policy","severity":"extreme"}],"range":{"min":199,"max":"lots"},"tags":["pdf",3,""]}',
      ),
    );
    expect(await run()).toEqual({
      summary: 'Strong demand',
      tags: ['pdf'],
      range: { min: 199, max: null },
      risks: [
        { risk: 'Refunds', severity: 'high' },
        { risk: 'Ad policy', severity: null },
      ],
    });
  });

  it('defaults missing fields and strips a code fence', async () => {
    stubFetch(async () => reply('```json\n{"summary":"Thin data"}\n```'));
    expect(await run()).toEqual({ summary: 'Thin data', tags: [], range: { min: null, max: null }, risks: [] });
  });

  it('fails with 503 and never calls Gemini without a key', async () => {
    config.gemini.apiKey = '';
    const fetch = stubFetch(async () => reply('{}'));
    await expect(run()).rejects.toMatchObject({ status: 503, message: NOT_CONFIGURED });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [429, {}, /rate limit/],
    [400, { message: 'API key not valid. Please pass a valid API key.' }, /rejected the API key/],
    [403, { message: 'Permission denied' }, /rejected the API key/],
    [404, { message: 'models/x is not found' }, /is not available/],
    [500, { message: 'Internal' }, /unavailable/],
    [400, { message: 'Invalid schema' }, /could not process/],
  ])('maps upstream %i to a safe 502', async (status, error, message) => {
    stubFetch(async () => json({ error: { ...error, details: 'upstream-secret-detail' } }, status));
    const err = await run().catch((e) => e);
    expect(err).toMatchObject({ status: 502, message: expect.stringMatching(message) });
    expect(err.message).not.toContain('upstream-secret-detail');
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain(KEY);
  });

  it('maps network failures and timeouts to 502', async () => {
    stubFetch(async () => Promise.reject(new TypeError('fetch failed')));
    await expect(run()).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/Could not reach/) });
    stubFetch(async () => Promise.reject(new DOMException('The operation timed out.', 'TimeoutError')));
    await expect(run()).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/took too long/) });
  });

  it.each([
    ['unreadable JSON', reply('Sure! Here is the analysis'), /unreadable/],
    ['a truncated answer', json({ candidates: [{ content: { parts: [{ text: '{"summary":"Str' }] }, finishReason: 'MAX_TOKENS' }] }), /cut off/],
    ['a blocked prompt', json({ promptFeedback: { blockReason: 'SAFETY' } }), /declined/],
    ['no candidates', json({ candidates: [] }), /empty response/],
    ['a non-object answer', reply('[1,2]'), /unexpected/],
    ['an empty analysis', reply('{"summary":"","tags":[],"risks":[{"severity":"high"}]}'), /empty analysis/],
  ])('rejects %s with 502', async (_, response, message) => {
    stubFetch(async () => response);
    await expect(run()).rejects.toMatchObject({ status: 502, message: expect.stringMatching(message) });
  });
});

describe('AI routes', () => {
  let mongo;
  let agent;
  const app = createApp();

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: config.adminEmail, password: config.adminPassword }).expect(200);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo?.stop();
  });

  it('requires a session', async () => {
    await request(app).get('/api/ai/status').expect(401);
  });

  it('reports status without exposing the key', async () => {
    config.gemini.apiKey = KEY;
    const on = await agent.get('/api/ai/status').expect(200);
    expect(on.body).toEqual({ enabled: true, model: config.gemini.model });
    expect(on.text).not.toContain(KEY);
    config.gemini.apiKey = '';
    expect((await agent.get('/api/ai/status').expect(200)).body.enabled).toBe(false);
  });

  it('returns 503 when no key is configured and keeps history readable', async () => {
    const fetch = stubFetch(async () => reply('{}'));
    const res = await agent.post('/api/ai/analyze').send({ kind: 'idea', prompt: 'A budgeting sheet for students' }).expect(503);
    expect(res.body).toEqual({ error: { message: NOT_CONFIGURED } });
    expect(fetch).not.toHaveBeenCalled();
    expect((await agent.get('/api/ai/analyses').expect(200)).body).toEqual({ items: [] });
  });

  it('validates the target', async () => {
    config.gemini.apiKey = KEY;
    const fetch = stubFetch(async () => reply('{}'));
    const missing = await agent.post('/api/ai/analyze').send({ kind: 'experiment' }).expect(400);
    expect(missing.body.error.fields).toEqual({ targetId: 'Choose an experiment' });
    const idea = await agent.post('/api/ai/analyze').send({ kind: 'idea', prompt: '  ' }).expect(400);
    expect(idea.body.error.fields).toEqual({ targetId: 'Choose an idea or describe one' });
    const unknown = await agent.post('/api/ai/analyze').send({ kind: 'product', targetId: new mongoose.Types.ObjectId().toString() }).expect(404);
    expect(unknown.body.error.message).toBe('Product not found');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('analyzes, saves, lists newest first and deletes', async () => {
    config.gemini.apiKey = KEY;
    const fetch = stubFetch(async () =>
      reply(JSON.stringify({ summary: 'Promising', adAngles: [{ angle: 'Save time', hook: 'Stop designing from scratch' }], risks: [{ risk: 'Copycats', severity: 'Medium' }] })),
    );
    const { body: idea } = await agent.post('/api/ideas').send({ name: 'Carousel templates', expectedPrice: 299 }).expect(201);

    const { body: saved } = await agent.post('/api/ai/analyze').send({ kind: 'idea', targetId: idea._id }).expect(201);
    expect(saved).toMatchObject({ kind: 'idea', targetId: idea._id, title: 'Carousel templates', model: config.gemini.model });
    expect(saved.input.idea).toMatchObject({ name: 'Carousel templates', expectedPrice: 299 });
    expect(saved.output).toMatchObject({ summary: 'Promising', productFormats: [], priceRange: { min: null, max: null, rationale: '' } });
    expect(saved.output.risks).toEqual([{ risk: 'Copycats', severity: 'medium' }]);
    expect(fetch.mock.calls[0][1].body).toContain('Carousel templates');

    const prompt = 'A Notion template that helps freelance designers track invoices and late payments';
    const { body: free } = await agent.post('/api/ai/analyze').send({ kind: 'idea', prompt }).expect(201);
    expect(free).toMatchObject({ targetId: null, title: 'A Notion template that helps freelance designers track…', input: { idea: { description: prompt } } });

    const all = await agent.get('/api/ai/analyses').query({ kind: 'idea' }).expect(200);
    expect(all.body.items.map((a) => a._id)).toEqual([free._id, saved._id]);
    expect(all.body.items[0]).not.toHaveProperty('input');
    const scoped = await agent.get('/api/ai/analyses').query({ targetId: idea._id, limit: 1 }).expect(200);
    expect(scoped.body.items.map((a) => a._id)).toEqual([saved._id]);
    expect((await agent.get(`/api/ai/analyses/${saved._id}`).expect(200)).body.input.idea.name).toBe('Carousel templates');

    await agent.delete(`/api/ai/analyses/${saved._id}`).expect(204);
    await agent.delete(`/api/ai/analyses/${saved._id}`).expect(404);
    expect((await agent.get('/api/ai/analyses').expect(200)).body.items).toHaveLength(1);
  });
});
