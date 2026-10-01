import { useSearchParams } from 'react-router';

const assign = (params, key, value) => (value == null || value === '' ? params.delete(key) : params.set(key, String(value)));

export function useSearchParamState() {
  const [params, setParams] = useSearchParams();
  const update = (change) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        change(next);
        return next;
      },
      { replace: true },
    );

  return {
    get: (key) => params.get(key) ?? '',
    set: (key, value) => update((next) => assign(next, key, value)),
    setMany: (values) => update((next) => Object.entries(values).forEach(([key, value]) => assign(next, key, value))),
    clear: (keep = []) => setParams((current) => [...current].filter(([key]) => keep.includes(key)), { replace: true }),
  };
}
