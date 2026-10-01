import { useEffect, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';
import { isIOS, isStandalone, swRegistration } from './pwa.js';

const TIMEOUT = 15_000;
const UNREACHABLE = 'This browser could not reach its push service. Try again later.';
const NO_KEY = "Couldn't check push notifications on the server. Check your connection and try again.";

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

let state = { permission: supported() ? Notification.permission : 'default', endpoint: supported() ? undefined : null, busy: false, error: null };
let loaded = false;
const listeners = new Set();
const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function keyBytes(base64Url) {
  const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function sameKey(a, b) {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  return bytes.length === b.length && bytes.every((v, i) => v === b[i]);
}

const withTimeout = (promise) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(UNREACHABLE)), TIMEOUT))]);

async function currentSubscription() {
  const reg = await swRegistration();
  return reg?.pushManager.getSubscription() ?? null;
}

function load() {
  if (loaded || !supported()) return;
  loaded = true;
  currentSubscription()
    .then((s) => setState({ endpoint: s?.endpoint ?? null }))
    .catch(() => setState({ endpoint: null }));
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((status) => {
      status.onchange = () => setState({ permission: Notification.permission });
    })
    .catch(() => {});
}

const register = (subscription, sync = false) =>
  api('/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON(), ...(sync && { sync }) } });

async function syncSubscription(reg, publicKey, { create }) {
  const applicationServerKey = keyBytes(publicKey);
  let subscription = await reg.pushManager.getSubscription();
  if (!create) {
    if (!subscription) return null;
    const removed = await register(subscription, true).then(() => false, (err) => (err.status === 410 ? true : Promise.reject(err)));
    if (removed) {
      await subscription.unsubscribe();
      return null;
    }
  }
  if (subscription && sameKey(subscription.options.applicationServerKey, applicationServerKey)) {
    if (create) await register(subscription);
    return subscription;
  }
  await subscription?.unsubscribe();
  subscription = await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey }));
  await register(subscription);
  return subscription;
}

export async function forgetThisDevice() {
  if (!supported()) return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } }).catch(() => null);
  await subscription.unsubscribe().catch(() => null);
  setState({ endpoint: null });
}

export function usePushKey() {
  return useQuery({ queryKey: ['push', 'key'], queryFn: ({ signal }) => api('/push/key', { signal }), staleTime: Infinity });
}

export function usePushSync() {
  const publicKey = usePushKey().data?.publicKey;
  useEffect(() => {
    if (!publicKey || !supported() || Notification.permission !== 'granted') return;
    swRegistration()
      .then((reg) => reg && syncSubscription(reg, publicKey, { create: false }).then((s) => setState({ endpoint: s?.endpoint ?? null })))
      .catch(() => {});
  }, [publicKey]);
}

export function usePush() {
  const queryClient = useQueryClient();
  const key = usePushKey();
  const { permission, endpoint, busy, error } = useSyncExternalStore(subscribe, () => state);
  useEffect(load, []);

  let status = 'on';
  if (isIOS() && !isStandalone()) status = 'install';
  else if (!supported()) status = 'unsupported';
  else if (key.isPending || endpoint === undefined) status = 'loading';
  else if (!key.data) status = 'error';
  else if (!key.data.configured) status = 'unconfigured';
  else if (permission === 'denied') status = 'denied';
  else if (!endpoint || permission !== 'granted') status = 'off';

  const run = async (task) => {
    setState({ busy: true, error: null });
    try {
      await task();
    } catch (err) {
      setState({ error: err.message || 'Something went wrong' });
    } finally {
      setState({ busy: false });
      queryClient.invalidateQueries({ queryKey: ['get', '/push/devices'] });
    }
  };

  const enable = () =>
    run(async () => {
      const result = await Notification.requestPermission();
      setState({ permission: result });
      if (result !== 'granted') return;
      const reg = await swRegistration();
      if (!reg) throw new Error('The service worker is not available in this browser.');
      await withTimeout(navigator.serviceWorker.ready);
      const publicKey = key.data?.publicKey ?? (await key.refetch()).data?.publicKey;
      if (!publicKey) throw new Error(NO_KEY);
      const subscription = await syncSubscription(reg, publicKey, { create: true });
      setState({ endpoint: subscription.endpoint });
    });

  const disable = () => run(forgetThisDevice);

  return { status, permission, endpoint, busy, error, enable, disable, retry: () => key.refetch() };
}
