export function Legend({ items, hidden, onToggle, className = '' }) {
  return (
    <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 ${onToggle ? 'max-md:gap-y-6' : ''} ${className}`}>
      {items.map((item) => {
        const off = hidden?.has(item.key);
        const swatch =
          item.type === 'line' ? (
            <span className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: item.color }} aria-hidden />
          );
        const content = (
          <>
            {swatch}
            <span className={off ? 'text-faint line-through' : 'text-body'}>{item.label}</span>
          </>
        );
        return (
          <li key={item.key}>
            {onToggle ? (
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => onToggle(item.key)}
                className="relative inline-flex items-center gap-1.5 text-xs hover:text-ink max-md:after:absolute max-md:after:-inset-x-1 max-md:after:-inset-y-3"
              >
                {content}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
