const VERSION = self.__SW_VERSION__;
const PRECACHE = self.__SW_PRECACHE__;
const SHELL = `shell-${VERSION}`;
const DATA = 'data';
const PRECACHED = new Set(PRECACHE);
const OFFLINE_API = new Set([
  '/api/auth/me',
  '/api/settings',
  '/api/productivity/today',
  '/api/goals',
  '/api/time-blocks',
  '/api/habits',
  '/api/notifications',
  '/api/notifications/unread-count',
  '/api/push/key',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function navigate(request) {
  try {
    return await fetch(request);
  } catch (err) {
    const shell = await caches.match('/index.html', { cacheName: SHELL });
    if (shell) return shell;
    throw err;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA);
  try {
    const response = await fetch(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('X-Offline-Copy', new Date().toISOString());
      await cache.put(request, new Response(await response.clone().blob(), { status: response.status, headers }));
    } else if (response.status === 401) {
      await caches.delete(DATA);
    }
    return response;
  } catch (err) {
    const copy = await cache.match(request);
    if (copy) return copy;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    if (OFFLINE_API.has(url.pathname)) event.respondWith(networkFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(navigate(request));
    return;
  }
  if (PRECACHED.has(url.pathname)) {
    event.respondWith(caches.match(url.pathname, { cacheName: SHELL }).then((hit) => hit ?? fetch(request)));
  }
});

const sameOriginPath = (value) => {
  try {
    const url = new URL(value || '/', self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
};

async function setBadge(count) {
  if (!('setAppBadge' in self.navigator) || typeof count !== 'number') return;
  await (count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()).catch(() => {});
}

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() ?? '' };
  }
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(data.title || 'Product Lab', {
        body: data.body || '',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        tag: data.tag || undefined,
        data: { url: sameOriginPath(data.url), id: data.id ?? null },
      });
      await setBadge(data.unread);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) client.postMessage({ type: 'PUSH', category: data.category ?? null });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { url = '/', id } = event.notification.data ?? {};
  event.waitUntil(
    (async () => {
      const read = id
        ? fetch(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST', credentials: 'same-origin' }).catch(() => null)
        : null;
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = windows.find((c) => 'focus' in c);
      if (client) {
        client.postMessage({ type: 'NAVIGATE', url });
        await client.focus().catch(() => null);
      } else {
        await self.clients.openWindow(url);
      }
      await read;
    })(),
  );
});

function base64UrlToBytes(value) {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

const postJson = (path, body) =>
  fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const previous = event.oldSubscription;
      let next = event.newSubscription;
      if (!next) {
        let applicationServerKey = previous?.options?.applicationServerKey;
        if (!applicationServerKey) {
          const key = await fetch('/api/push/key', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null));
          if (!key?.publicKey) return;
          applicationServerKey = base64UrlToBytes(key.publicKey);
        }
        next = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      await postJson('/api/push/subscribe', { subscription: next.toJSON() });
      if (previous && previous.endpoint !== next.endpoint) await postJson('/api/push/unsubscribe', { endpoint: previous.endpoint });
    })(),
  );
});
