import { WEEKDAYS } from '@product-lab/shared/constants';
import { Badge, Dot } from '../../components/ui/Badge.jsx';
import { blockColor, categoryLabel, dayLabel, daysLabel } from './schedule.js';

export function DayChips({ days }) {
  const label = daysLabel(days);
  return (
    <span className="inline-flex gap-0.5" title={label}>
      <span className="sr-only">{label}</span>
      {WEEKDAYS.map((d) => (
        <span
          key={d}
          aria-hidden
          className={`flex size-5 items-center justify-center rounded-xs text-[10px] font-medium ${days.includes(d) ? 'bg-tint-strong text-ink' : 'text-faint'}`}
        >
          {dayLabel(d)[0]}
        </span>
      ))}
    </span>
  );
}

export function CategoryBadge({ category }) {
  return (
    <Badge>
      <Dot color={blockColor(category)} />
      {categoryLabel(category)}
    </Badge>
  );
}

export function BlockSummaryList({ blocks }) {
  return (
    <ul className="divide-y divide-hairline-soft">
      {blocks.map((b) => (
        <li key={b._id} className={`flex items-center gap-3 py-2 ${b.enabled ? '' : 'opacity-60'}`}>
          <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: blockColor(b.category) }} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{b.name}</p>
            <p className="truncate text-xs text-muted">
              {categoryLabel(b.category)} · {daysLabel(b.days)}
              {!b.enabled && ' · Off'}
            </p>
          </div>
          <span className="shrink-0 text-[13px] text-body tabular-nums">
            {b.start}–{b.end}
          </span>
        </li>
      ))}
    </ul>
  );
}
