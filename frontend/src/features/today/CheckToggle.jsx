import { Check } from 'lucide-react';

export function CheckToggle({ done, onToggle, label, large = false }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={done}
      aria-label={label}
      className={`group flex shrink-0 items-center justify-center rounded-full border-2 transition-colors ${large ? 'size-12' : 'size-10'} ${
        done ? 'border-positive bg-positive text-white' : 'border-faint/70 text-positive hover:border-positive'
      }`}
    >
      <Check
        className={`${large ? 'size-6' : 'size-5'} ${done ? '' : 'opacity-0 transition-opacity group-hover:opacity-60'}`}
        strokeWidth={2.5}
        aria-hidden
      />
    </button>
  );
}
