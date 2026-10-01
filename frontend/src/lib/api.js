import { useSyncExternalStore } from 'react';
import { noteResponse } from './pwa.js';

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields ?? {};
  }
}

let unauthorizedHandler = () => {};
export const onUnauthorized = (fn) => {
  unauthorizedHandler = fn;
};

const OUTBOX_KEY = 'product-lab.outbox';
const QUEUED = [
  /^(PUT|DELETE) \/habits\/[^/]+\/completions\/[^/]+$/,
  /^PUT \/daily-outcomes\/[^/]+$/,
  /^PUT \/reviews\/daily\/[^/]+$/,
  /^POST \/notifications\/[^/]+\/read$/,
];

function loadOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY)) ?? [];
  } catch {
    return [];
  }
}

let outbox = loadOutbox();
let flushing = null;
let sentHandler = () => {};
const waiting = new Map();
const watchers = new Set();
const notify = () => watchers.forEach((fn) => fn());
const watch = (fn) => {
  watchers.add(fn);
  return () => watchers.delete(fn);
};

function setOutbox(next) {
  outbox = next;
  try {
    if (next.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(next));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* storage unavailable: the queue lasts while the page is open */
  }
  notify();
}

function toQuery(params) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

function unreachable(method) {
  if (method !== 'GET') return `${navigator.onLine ? "Can't reach the server" : "You're offline"}. This change was not saved.`;
  return navigator.onLine ? 'Cannot reach the server. Check that the API is running.' : "You're offline. This will load when you reconnect.";
}

async function send(path, { method = 'GET', body, params, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}${toQuery(params)}`, {
      method,
      signal,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, unreachable(method));
  }
  noteResponse(res);
  if (res.ok && outbox.length) flushOutbox();
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) unauthorizedHandler();
    throw new ApiError(res.status, data?.error?.message ?? `Request failed (${res.status})`, data?.error?.fields);
  }
  return data;
}

function enqueue(method, path, body) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  setOutbox([...outbox, { id, method, path, body }]);
  return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }));
}

export function api(path, options = {}) {
  const method = options.method ?? 'GET';
  if (!QUEUED.some((re) => re.test(`${method} ${path}`))) return send(path, options);
  if (navigator.onLine && !outbox.length) {
    return send(path, options).catch((err) => (err.status === 0 ? enqueue(method, path, options.body) : Promise.reject(err)));
  }
  const queued = enqueue(method, path, options.body);
  if (navigator.onLine) flushOutbox();
  return queued;
}

async function replay() {
  let done = 0;
  try {
    while (outbox.length) {
      const [entry] = outbox;
      const waiter = waiting.get(entry.id);
      try {
        const data = await send(entry.path, { method: entry.method, body: entry.body });
        waiter?.resolve(data);
      } catch (err) {
        if (!(err.status >= 400) || err.status === 401) break;
        waiter?.reject(err);
      }
      waiting.delete(entry.id);
      setOutbox(outbox.filter((e) => e.id !== entry.id));
      done += 1;
    }
  } finally {
    flushing = null;
  }
  if (done) sentHandler();
}

function flushOutbox() {
  if (outbox.length && !flushing) flushing = replay();
}

export function clearOutbox() {
  waiting.clear();
  setOutbox([]);
}

export function startOutbox(onSent) {
  sentHandler = onSent;
  window.addEventListener('online', flushOutbox);
  window.addEventListener('storage', (event) => {
    if (event.key !== OUTBOX_KEY) return;
    outbox = loadOutbox();
    for (const [id, waiter] of waiting) {
      if (outbox.some((e) => e.id === id)) continue;
      waiting.delete(id);
      waiter.resolve(null);
    }
    notify();
  });
}

export const useOutbox = () => useSyncExternalStore(watch, () => outbox.length);
