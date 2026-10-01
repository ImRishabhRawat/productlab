import { useEffect, useEffectEvent, useState } from 'react';
import { Search, X } from 'lucide-react';

export function SearchInput({ value = '', onChange, placeholder = 'Search', delay = 250, className = '' }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const emit = useEffectEvent((next) => onChange(next));

  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => emit(draft), delay);
    return () => clearTimeout(t);
  }, [draft, value, delay]);

  return (
    <div className={`relative w-full sm:w-60 ${className}`}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-md border border-hairline bg-canvas pr-8 pl-8 text-sm text-ink placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft('');
            onChange('');
          }}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
