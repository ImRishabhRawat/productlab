import { NavLink } from 'react-router';

const tabClass = (active) =>
  `inline-flex h-8 items-center gap-1.5 rounded-md px-3 max-md:h-10 text-[13px] font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-2 ${
    active ? 'bg-tint text-ink' : 'text-muted hover:text-ink'
  }`;

function Count({ value }) {
  if (value == null) return null;
  return <span className="rounded-full bg-canvas px-1.5 text-[11px] leading-4 tabular-nums text-muted">{value}</span>;
}

export function Tabs({ tabs, value, onChange, className = '', label = 'Views' }) {
  return (
    <div role="tablist" aria-label={label} className={`flex items-center gap-1 overflow-x-auto ${className}`}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={t.value === value} onClick={() => onChange(t.value)} className={tabClass(t.value === value)}>
          {t.label}
          <Count value={t.count} />
        </button>
      ))}
    </div>
  );
}

export function TabLinks({ tabs, className = '' }) {
  return (
    <nav className={`flex items-center gap-1 overflow-x-auto ${className}`}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end ?? true} className={({ isActive }) => tabClass(isActive)}>
          {t.label}
          <Count value={t.count} />
        </NavLink>
      ))}
    </nav>
  );
}

export function SegmentedControl({ options, value, onChange, label, size = 'md' }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full items-center overflow-x-auto rounded-md border border-hairline bg-canvas p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-[5px] font-medium whitespace-nowrap transition-colors focus-visible:-outline-offset-2 ${size === 'sm' ? 'h-6 px-2 text-xs max-md:h-9' : 'h-7 px-2.5 text-[13px] max-md:h-9'} ${
              active ? 'bg-tint text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
