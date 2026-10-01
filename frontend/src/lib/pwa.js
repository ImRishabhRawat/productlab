import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';

const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const CHUNK_ERROR = /dynamically imported module|module script failed|Unable to preload/i;
const CHUNK_RELOAD_KEY = 'product-lab.chunk-reload';

let registration = null;
let waiting = null;
let replaced = false;
let installPrompt = null;
let lastUpdateCheck = 0;
let offlineCopy = null;
let deepLink = null;

const hasServiceWorker = () => 'serviceWorker' in navigator;

function trackWaiting(reg) {
  const markWaiting = (worker) => {
    if (!worker || !navigator.serviceWorker.controller) return;
    waiting = worker;
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'activated' && worker.state !== 'redundant') return;
      replaced ||= worker.state === 'activated';
      if (waiting === worker) waiting = null;
      emit();
    });
    emit();
  };
  markWaiting(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    worker?.addEventListener('statechange', () => worker.state === 'installed' && markWaiting(worker));
  });
}

export function swRegistration() {
  if (!hasServiceWorker()) return Promise.resolve(null);
  registration ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    trackWaiting(reg);
    return reg;
  });
  return registration;
}

export function startPwa() {
  if (hasServiceWorker()) {
    swRegistration().catch(() => {
      registration = null;
    });
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type !== 'NAVIGATE') return;
      deepLink = event.data.url;
      emit();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastUpdateCheck < 30 * 60_000) return;
      lastUpdateCheck = Date.now();
      swRegistration()
        .then((reg) => reg?.update())
        .catch(() => {});
    });
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    emit();
  });
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
}

export function applyUpdate() {
  if (!waiting) return window.location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function reloadAfterChunkError(error) {
  if (!CHUNK_ERROR.test(error?.message ?? '') || !navigator.onLine) return;
  try {
    if (Date.now() - Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) < 30_000) return;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

export function clearOfflineData() {
  navigator.clearAppBadge?.().catch(() => {});
  return 'caches' in window ? caches.delete('data').catch(() => false) : Promise.resolve(false);
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function noteResponse(res) {
  const copy = res.headers.get('x-offline-copy');
  if (copy === offlineCopy) return;
  offlineCopy = copy;
  emit();
}

export const useOfflineCopy = () => useSyncExternalStore(subscribe, () => offlineCopy);

export const useUpdateReady = () => useSyncExternalStore(subscribe, () => Boolean(waiting) || replaced);

export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine);

export function useDeepLinks() {
  const navigate = useNavigate();
  const url = useSyncExternalStore(subscribe, () => deepLink);
  useEffect(() => {
    if (!url || url !== deepLink) return;
    deepLink = null;
    emit();
    navigate(url);
  }, [url, navigate]);
}

export function useInstall() {
  const prompt = useSyncExternalStore(subscribe, () => installPrompt);
  const standalone = isStandalone();
  return {
    standalone,
    ios: isIOS(),
    canPrompt: Boolean(prompt) && !standalone,
    async install() {
      if (!prompt) return 'unavailable';
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      installPrompt = null;
      emit();
      return outcome;
    },
  };
}
