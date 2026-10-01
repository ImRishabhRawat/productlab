import { z } from 'zod';
import { config } from '../../config.js';
import { HttpError } from '../../utils/http.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const STRING = { type: 'STRING' };
export const NUMBER = { type: 'NUMBER' };
export const oneOf = (values) => ({ type: 'STRING', enum: values });
export const list = (items) => ({ type: 'ARRAY', items });
export const obj = (properties) => ({ type: 'OBJECT', properties, required: Object.keys(properties), propertyOrdering: Object.keys(properties) });

export const aiStatus = () => ({ enabled: Boolean(config.gemini.apiKey), model: config.gemini.model });

export function assertConfigured() {
  if (!config.gemini.apiKey) throw new HttpError(503, 'AI is not configured. Set GEMINI_API_KEY on the server.');
}

const fail = (message) => new HttpError(502, message);
const asObject = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function hasContent(schema, v) {
  if (schema.type === 'OBJECT') return Object.entries(schema.properties).some(([k, s]) => hasContent(s, v?.[k]));
  if (schema.type === 'ARRAY') return v?.length > 0;
  return !schema.enum && v != null && v !== '';
}

function lenient(schema) {
  switch (schema.type) {
    case 'OBJECT':
      return z.preprocess(asObject, z.object(Object.fromEntries(Object.entries(schema.properties).map(([k, s]) => [k, lenient(s)]))));
    case 'ARRAY':
      return z
        .preprocess((v) => (Array.isArray(v) ? v : []), z.array(lenient(schema.items)))
        .transform((items) => items.filter((item) => hasContent(schema.items, item)));
    case 'NUMBER':
      return z.number().catch(null);
    default:
      return schema.enum ? z.string().trim().toLowerCase().pipe(z.enum(schema.enum)).catch(null) : z.string().trim().catch('');
  }
}

function upstreamMessage(status, error) {
  if (status === 429) return 'The AI service is over its rate limit. Try again in a minute.';
  if (status === 401 || status === 403 || /api key/i.test(error?.message ?? '')) return 'The AI service rejected the API key. Check GEMINI_API_KEY on the server.';
  if (status === 404) return `The AI model "${config.gemini.model}" is not available. Check GEMINI_MODEL on the server.`;
  if (status >= 500) return 'The AI service is unavailable right now. Try again shortly.';
  return 'The AI service could not process this request.';
}

function readJson(data) {
  const candidate = data?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought)
    .map((p) => p.text ?? '')
    .join('')
    .trim();
  if (!text) {
    const blocked = data?.promptFeedback?.blockReason || candidate?.finishReason === 'SAFETY';
    throw fail(blocked ? 'The AI declined to analyze this request.' : 'The AI returned an empty response. Try again.');
  }
  try {
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    throw fail(candidate?.finishReason === 'MAX_TOKENS' ? 'The AI response was cut off. Try again.' : 'The AI returned an unreadable response. Try again.');
  }
}

export async function generateJson({ system, prompt, schema }) {
  assertConfigured();
  const { apiKey, model } = config.gemini;
  let res;
  let data;
  try {
    res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.4 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    data = await res.json().catch(() => null);
  } catch (err) {
    throw fail(err?.name === 'TimeoutError' ? 'The AI took too long to respond. Try again.' : 'Could not reach the AI service. Try again.');
  }
  if (!res.ok) {
    console.warn(`Gemini request failed (${res.status}): ${data?.error?.message ?? 'no details'}`);
    throw fail(upstreamMessage(res.status, data?.error));
  }
  const raw = readJson(data);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw fail('The AI returned an unexpected response. Try again.');
  const output = lenient(schema).parse(raw);
  if (!hasContent(schema, output)) throw fail('The AI returned an empty analysis. Try again.');
  return output;
}
