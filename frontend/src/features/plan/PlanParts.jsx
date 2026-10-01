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
