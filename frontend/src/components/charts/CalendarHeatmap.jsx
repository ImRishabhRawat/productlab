import { useLayoutEffect, useRef } from 'react';
import { addDays, bucketStart, daysBetween, weekdayOf } from '@product-lab/shared/dates';
import { fmtDate, fmtMonth, fmtNumber } from '../../lib/format.js';
import { CHART, SEQUENTIAL, sequentialColor } from './palette.js';

const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
const WEEKDAY_INITIAL = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DONE = SEQUENTIAL[8];

const cellColor = (value, max) => (!value ? CHART.grid : max <= 1 ? DONE : sequentialColor(value, max));
const labelClass = (value, color) => (!value ? 'text-body' : SEQUENTIAL.indexOf(color) >= 7 ? 'text-white' : 'text-ink');

const describe = (date, value, format) => `${fmtDate(date, { weekday: true })}: ${format(value ?? 0)}`;

export function CalendarHeatmap({ from, to, values, max = 1, format = (v) => fmtNumber(v), label, cell = 14 }) {
  const scroller = useRef(null);
  const start = bucketStart(from, 'week');
  const weeks = Math.floor(daysBetween(start, to) / 7) + 1;
  const columns = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  const months = columns.map((days, w) => {
    const prev = addDays(days[0], -7);
    return w === 0 || days[0].slice(5, 7) !== (prev < from ? from : prev).slice(5, 7) ? fmtMonth(days.find((d) => d >= from) ?? days[0]) : '';
  });
  if (months[0] && months[1]) months[0] = '';

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [from, to]);

  return (
    <div ref={scroller} className="overflow-x-auto">
      <div role="img" aria-label={label} className="inline-flex gap-1.5">
        <div className="flex flex-col gap-0.5 pt-5 text-[10px] leading-none text-muted" aria-hidden>
          {ROW_LABELS.map((l, i) => (
            <span key={i} className="flex items-center" style={{ height: cell }}>
              {l}
            </span>
          ))}
        </div>
        <div className="flex gap-0.5">
          {columns.map((days, w) => {
            return (
              <div key={days[0]} className="flex flex-col gap-0.5">
                <span className="h-4.5 text-[10px] leading-none whitespace-nowrap text-muted" style={{ width: cell }} aria-hidden>
                  {months[w]}
                </span>
                {days.map((date) => {
                  const inRange = date >= from && date <= to;
                  const value = values[date] ?? 0;
                  return (
                    <span
                      key={date}
                      title={inRange ? describe(date, value, format) : undefined}
                      className="rounded-[3px]"
                      style={{ width: cell, height: cell, backgroundColor: inRange ? cellColor(value, max) : 'transparent' }}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function DayStrip({ days, max = 1, format = (v) => fmtNumber(v), label, cell = 18, today }) {
  return (
    <div role="img" aria-label={label} className="flex gap-0.5">
      {days.map(({ date, value }) => {
        const color = cellColor(value, max);
        return (
          <span
            key={date}
            title={describe(date, value, format)}
            className={`flex items-center justify-center rounded-[3px] text-[10px] font-medium ${labelClass(value, color)} ${
              date === today ? 'ring-1 ring-ink ring-offset-1 ring-offset-canvas' : ''
            }`}
            style={{ width: cell, height: cell, backgroundColor: color }}
          >
            {WEEKDAY_INITIAL[weekdayOf(date)]}
          </span>
        );
      })}
    </div>
  );
}
