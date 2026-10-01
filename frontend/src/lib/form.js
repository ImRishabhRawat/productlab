import { useCallback, useEffect, useState } from 'react';
import { fieldErrors } from '@product-lab/shared/schemas';

export function getIn(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function setIn(obj, path, value) {
  const [key, ...rest] = path.split('.');
  if (!rest.length) return { ...obj, [key]: value };
  return { ...obj, [key]: setIn(obj?.[key] ?? {}, rest.join('.'), value) };
}

export const numberOrUndefined = (v) => (v === '' || v == null ? undefined : Number(v));
export const numberOrNull = (v) => (v === '' || v == null ? null : Number(v));
export const str = (v) => (v == null ? '' : String(v));

function focusFirstInvalid() {
  const root = [...document.querySelectorAll('dialog[open]')].at(-1) ?? document;
  const field = root.querySelector('[aria-invalid="true"]');
  if (!field) return;
  field.scrollIntoView({ block: 'center' });
  field.focus({ preventScroll: true });
}

export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (failures) focusFirstInvalid();
  }, [failures]);

  const set = useCallback((name, value) => {
    setValues((v) => setIn(v, name, value));
    setErrors((e) => {
      if (!e[name]) return e;
      const next = { ...e };
      delete next[name];
      return next;
    });
  }, []);

  const fail = (next) => {
    setErrors(next);
    if (Object.keys(next).length) setFailures((n) => n + 1);
  };

  const field = (name) => ({
    name,
    value: getIn(values, name) ?? '',
    error: errors[name],
    onChange: (e) => set(name, e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e),
  });

  const validate = (schema, payload) => {
    const result = schema.safeParse(payload);
    if (result.success) {
      setErrors({});
      return result.data;
    }
    fail(fieldErrors(result.error));
    return null;
  };

  const serverErrors = (error) => fail(error?.fields ?? {});

  return { values, setValues, set, errors, setErrors, serverErrors, field, validate };
}
