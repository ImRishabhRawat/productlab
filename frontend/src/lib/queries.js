import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.js';

export function useList(resource, params, options) {
  return useQuery({
    queryKey: [resource, 'list', params ?? {}],
    queryFn: ({ signal }) => api(`/${resource}`, { params, signal }),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useItem(resource, id, options) {
  return useQuery({
    queryKey: [resource, 'item', id],
    queryFn: ({ signal }) => api(`/${resource}/${id}`, { signal }),
    enabled: Boolean(id),
    ...options,
  });
}

export function useGet(path, params, options) {
  return useQuery({
    queryKey: ['get', path, params ?? {}],
    queryFn: ({ signal }) => api(path, { params, signal }),
    enabled: Boolean(path),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export function useAnalytics(name, params, options) {
  return useQuery({
    queryKey: ['analytics', name, params ?? {}],
    queryFn: ({ signal }) => api(`/analytics/${name}`, { params, signal }),
    placeholderData: keepPreviousData,
    ...options,
  });
}

export const invalidateData = (queryClient) =>
  queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' && q.queryKey[0] !== 'settings' });

export function useMutate(mutationFn, options = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    ...options,
    onSuccess: (...args) => {
      invalidateData(queryClient);
      return options.onSuccess?.(...args);
    },
  });
}

export const useUpdate = (resource, options) =>
  useMutate(({ id, ...body }) => api(`/${resource}/${id}`, { method: 'PATCH', body }), options);

export const useRemove = (resource, options) => useMutate((id) => api(`/${resource}/${id}`, { method: 'DELETE' }), options);
