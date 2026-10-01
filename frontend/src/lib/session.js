import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, clearOutbox, onUnauthorized } from './api.js';
import { configureFormat } from './format.js';
import { forgetThisDevice } from './push.js';
import { clearOfflineData } from './pwa.js';

const LOGOUT_KEY = 'product-lab.logout-pending';

function logoutPending() {
  try {
    return localStorage.getItem(LOGOUT_KEY) === '1';
  } catch {
    return false;
  }
}

function setLogoutPending(pending) {
  try {
    if (pending) localStorage.setItem(LOGOUT_KEY, '1');
    else localStorage.removeItem(LOGOUT_KEY);
  } catch {
    /* storage unavailable */
  }
}

async function logout() {
  const ended = await api('/auth/logout', { method: 'POST' }).then(() => true, () => false);
  setLogoutPending(!ended);
}

function endSession(queryClient) {
  queryClient.setQueryData(['me'], null);
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
  queryClient.getMutationCache().clear();
}

export function startSession(queryClient) {
  onUnauthorized(() => {
    clearOfflineData();
    endSession(queryClient);
  });
  window.addEventListener('online', () => logoutPending() && logout());
}

export function useSession() {
  return useQuery({
    queryKey: ['me'],
    queryFn: async ({ signal }) => {
      if (logoutPending()) return logout().then(() => null);
      return api('/auth/me', { signal }).catch((err) => (err.status === 401 ? null : Promise.reject(err)));
    },
    staleTime: Infinity,
    retry: false,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async ({ signal }) => {
      const settings = await api('/settings', { signal });
      configureFormat({ currency: settings.currency, locale: settings.locale, timezone: settings.timezone });
      return settings;
    },
    staleTime: Infinity,
  });
}

export function signIn(body) {
  setLogoutPending(false);
  return api('/auth/login', { method: 'POST', body });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await forgetThisDevice().catch(() => null);
    await logout();
    clearOutbox();
    await clearOfflineData();
    endSession(queryClient);
  };
}
