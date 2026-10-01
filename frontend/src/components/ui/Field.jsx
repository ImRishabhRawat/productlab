import { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { SERIES } from '../charts/palette.js';

const control =
  'w-full rounded-md border bg-canvas text-sm text-ink placeholder:text-faint transition-colors focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none disabled:opacity-60 max-md:text-base';
const border = (invalid) => (invalid ? 'border-negative' : 'border-hairline');

export function Field({ label, hint, error, htmlFor, required, className = '', children }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-body">
          {label}
          {required && <span className="text-negative"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-negative" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ invalid, prefix, suffix, className = '', ...props }) {
  if (!prefix && !suffix) return <input className={`${control} ${border(invalid)} h-9 px-3 max-md:h-10 ${className}`} {...props} />;
  return (
    <div className={`relative ${className}`}>
      {prefix && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted">{prefix}</span>}
      <input className={`${control} ${border(invalid)} h-9 max-md:h-10 ${prefix ? 'pl-7' : 'pl-3'} ${suffix ? 'pr-8' : 'pr-3'}`} {...props} />
      {suffix && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>}
    </div>
  );
}

export function Textarea({ invalid, className = '', rows = 3, ...props }) {
  return <textarea rows={rows} className={`${control} ${border(invalid)} px-3 py-2 leading-relaxed ${className}`} {...props} />;
}

const toOptions = (options) => options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

export function Select({ invalid, options = [], placeholder, className = '', ...props }) {
  return (
    <div className={`relative ${className}`}>
      <select className={`${control} ${border(invalid)} h-9 appearance-none pr-8 pl-3 max-md:h-10`} {...props}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {toOptions(options).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, children, className = '', ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={children || props['aria-labelledby'] ? undefined : label}
      title={children || props['aria-labelledby'] ? undefined : label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2.5 rounded-md px-0.5 text-sm text-body disabled:opacity-50 md:min-h-9 ${className}`}
      {...props}
    >
      <span className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${checked ? 'bg-primary' : 'bg-muted/80'}`} aria-hidden>
        <span className={`size-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </span>
      {children && <span className="text-left">{children}</span>}
    </button>
  );
}

export function Checkbox({ label, className = '', ...props }) {
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-sm text-body ${className}`}>
      <input type="checkbox" className="size-4 rounded-sm accent-primary" {...props} />
      {label}
    </label>
  );
}

export function FormField({ form, name, label, hint, required, as = 'input', options, placeholder, className, ...props }) {
  const id = useId();
  const { value, onChange, error } = form.field(name);
  const shared = {
    id,
    name,
    value,
    onChange,
    invalid: Boolean(error),
    'aria-invalid': Boolean(error) || undefined,
    'data-autofocus': props.autoFocus || undefined,
    ...props,
  };
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={required} className={className}>
      {as === 'textarea' ? (
        <Textarea placeholder={placeholder} {...shared} />
      ) : as === 'select' ? (
        <Select options={options} placeholder={placeholder} {...shared} />
      ) : (
        <Input placeholder={placeholder} {...shared} />
      )}
    </Field>
  );
}

export function ScoreInput({ value, onChange, label, max = 10, id }) {
  const current = typeof value === 'number' ? value : null;
  const set = (v) => onChange(v === current ? (v > 0 ? v - 1 : null) : v);
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min((current ?? -1) + 1, max));
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(current == null || current === 0 ? null : current - 1);
    else if (e.key === 'Backspace' || e.key === 'Delete') onChange(null);
    else return;
    e.preventDefault();
  };
  return (
    <div className="flex items-center gap-3">
      <div
        id={id}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={current ?? undefined}
        aria-valuetext={current == null ? 'Not set' : `${current} of ${max}`}
        onKeyDown={onKeyDown}
        className="flex flex-1 gap-0.5 rounded-sm"
      >
        {Array.from({ length: max }, (_, i) => {
          const filled = current != null && i < current;
          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => set(i + 1)}
              className={`h-5 flex-1 rounded-[3px] transition-colors first:rounded-l-md last:rounded-r-md ${filled ? '' : 'bg-tint hover:bg-tint-strong'}`}
              style={filled ? { backgroundColor: SERIES[0] } : undefined}
            />
          );
        })}
      </div>
      <span className="w-10 text-right text-[13px] font-medium tabular-nums text-ink">{current ?? '—'}</span>
    </div>
  );
}
