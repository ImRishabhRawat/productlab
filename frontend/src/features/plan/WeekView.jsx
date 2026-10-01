import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { weekdayOf } from '@product-lab/shared/dates';
import { CHART } from '../../components/charts/palette.js';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState } from '../../components/ui/States.jsx';
import { DASH, fmtDuration } from '../../lib/format.js';
import { blockColor, blockTitle, categoryLabel, clockLabel, spanLabel } from './schedule.js';

const HOUR = 48;
const GRID = `linear-gradient(to bottom, ${CHART.grid} 1px, transparent 1px)`;

export const weekTable = (days) => ({
  rowKey: 'day',
  rows: days,
  columns: [
    { key: 'label', header: 'Day' },
    { key: 'count', header: 'Blocks', align: 'right' },
    { key: 'minutes', header: 'Planned', align: 'right', format: (v) => (v ? fmtDuration(v) : DASH) },
    { key: 'first', header: 'Starts', align: 'right' },
    { key: 'last', header: 'Ends', align: 'right' },
  ],
});

function WeekBlock({ item, top, height, onEdit }) {
  const { block, lane, lanes } = item;
  const color = blockColor(block.category);
  const title = blockTitle(block);
  const size = height >= 34 ? 'full' : height >= 16 ? 'line' : 'tiny';
  return (
    <button
      type="button"
      title={title}
      aria-label={`${title}. Edit block`}
      onClick={() => onEdit(block)}
      className={`@container absolute flex flex-col overflow-hidden rounded-r-xs border-l-[3px] px-1.5 text-left transition-shadow hover:shadow-sm ${size === 'full' ? 'pt-0.5' : 'justify-center'}`}
      style={{
        top: top + 1,
        height,
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
        borderColor: color,
        backgroundColor: `${color}29`,
      }}
    >
      <span className={`truncate font-medium text-ink ${size === 'tiny' ? 'text-[10px] leading-[10px]' : 'text-[11.5px] leading-4'}`}>
        {block.name}
        {size === 'line' && <span className="ml-1 font-normal text-body tabular-nums @max-[3rem]:hidden">{block.start}</span>}
      </span>
      {size === 'full' && (
        <span className="truncate text-[11px] leading-4 text-body tabular-nums @max-[3rem]:hidden">
          {block.start}–{block.end}
        </span>
      )}
      {height >= 50 && <span className="truncate text-[11px] leading-4 text-muted @max-[3rem]:hidden">{categoryLabel(block.category)}</span>}
    </button>
  );
}

export function WeekView({ days, today, onEdit }) {
  const todayDay = weekdayOf(today);
  const items = days.flatMap((d) => d.items);
  const start = Math.floor(Math.min(...items.map((i) => i.from)) / 60) * 60;
  const end = Math.ceil(Math.max(...items.map((i) => i.to)) / 60) * 60;
  const y = (minutes) => ((minutes - start) / 60) * HOUR;
  const hours = Array.from({ length: (end - start) / 60 + 1 }, (_, i) => start + i * 60);
  const columns = 'grid grid-cols-[3.25rem_repeat(7,minmax(0,1fr))]';

  return (
    <div>
      <div className={`${columns} sticky top-0 z-10 bg-canvas`}>
        <span />
        {days.map((d) => (
          <div key={d.day} className="min-w-0 text-center">
            <span
              className={`inline-flex h-6 items-center rounded-full px-2 text-[13px] font-medium ${d.day === todayDay ? 'bg-dark text-canvas' : 'text-ink'}`}
            >
              {d.label}
              {d.day === todayDay && <span className="sr-only">, today</span>}
            </span>
            <p className="mt-0.5 truncate text-[11px] text-muted tabular-nums">{d.minutes ? fmtDuration(d.minutes) : DASH}</p>
          </div>
        ))}
      </div>
      <div className={`${columns} mt-2.5 border-b border-hairline-soft`} style={{ height: y(end) }}>
        <div className="relative" aria-hidden>
          {hours.map((h) => (
            <span
              key={h}
              className="absolute right-2 -translate-y-1/2 text-[11px] leading-none whitespace-nowrap text-muted tabular-nums"
              style={{ top: y(h) }}
            >
              {clockLabel(h)}
            </span>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.day}
            className={`relative border-l border-hairline-soft ${d.day === todayDay ? 'bg-tint/50' : ''}`}
            style={{ backgroundImage: GRID, backgroundSize: `100% ${HOUR}px` }}
          >
            {start < 1440 && end > 1440 && <span className="absolute inset-x-0 h-px bg-hairline" style={{ top: y(1440) }} aria-hidden />}
            {d.items.map((item) => (
              <WeekBlock key={item.block._id} item={item} top={y(item.from)} height={y(item.to) - y(item.from) - 2} onEdit={onEdit} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DayView({ days, today, onEdit, onAdd }) {
  const todayDay = weekdayOf(today);
  const [day, setDay] = useState(todayDay);
  const selected = days.find((d) => d.day === day);

  return (
    <div>
      <div role="radiogroup" aria-label="Day" className="grid grid-cols-7 gap-1">
        {days.map((d) => (
          <button
            key={d.day}
            type="button"
            role="radio"
            aria-checked={d.day === day}
            onClick={() => setDay(d.day)}
            className={`flex min-h-12 min-w-0 flex-col items-center justify-center rounded-md text-[13px] font-medium transition-colors ${
              d.day === day ? 'bg-tint text-ink' : 'text-muted hover:bg-tint/60'
            }`}
          >
            <span className={d.day === todayDay ? 'underline decoration-primary decoration-2 underline-offset-4' : ''}>{d.label}</span>
            {d.day === todayDay && <span className="sr-only">, today</span>}
            <span className="text-[11px] font-normal tabular-nums">{d.count || DASH}</span>
          </button>
        ))}
      </div>
      {selected.items.length ? (
        <ol className="mt-3 space-y-1">
          {selected.items.map(({ block }) => (
            <li key={block._id}>
              <button
                type="button"
                onClick={() => onEdit(block)}
                aria-label={`${blockTitle(block)}. Edit block`}
                className="flex min-h-14 w-full items-stretch gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-tint/60"
              >
                <span className="w-11 shrink-0 text-[13px] leading-5 tabular-nums">
                  <span className="block font-medium text-ink">{block.start}</span>
                  <span className="block text-muted">{block.end}</span>
                </span>
                <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: blockColor(block.category) }} aria-hidden />
                <span className="min-w-0 flex-1 self-center">
                  <span className="block truncate text-sm font-medium text-ink">{block.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {categoryLabel(block.category)} · {spanLabel(block)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState
          compact
          icon={CalendarPlus}
          title={`Nothing planned on ${selected.label}.`}
          action={
            <Button size="sm" icon={CalendarPlus} onClick={() => onAdd([day])}>
              Add a block on {selected.label}
            </Button>
          }
        />
      )}
    </div>
  );
}
