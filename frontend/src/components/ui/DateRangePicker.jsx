import { useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { RANGE_PRESETS } from '@product-lab/shared/constants';
import { useDateRange } from '../../lib/dateRange.jsx';
import { Button } from './Button.jsx';
import { Input } from './Field.jsx';
import { Popover } from './Popover.jsx';
import { SegmentedControl } from './Tabs.jsx';

const DATE = 'min-w-0 flex-1';

function CustomRange({ onApply, initial }) {
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  return (
    <div className="border-t border-hairline-soft p-3">
      <div className="mb-2 text-xs font-medium text-muted">Custom range</div>
      <div className="flex items-center gap-2">
        <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={DATE} />
        <span className="text-muted">–</span>
        <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} aria-label="To" className={DATE} />
      </div>
      <Button size="sm" variant="primary" className="mt-2.5 w-full justify-center" disabled={!from || !to} onClick={() => onApply(from, to)}>
        Apply
      </Button>
    </div>
  );
}

export function DateRangePicker({ allowAll = true }) {
  const range = useDateRange();
  const presets = RANGE_PRESETS.filter((p) => p.key !== 'custom' && (allowAll || p.key !== 'all'));
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline bg-canvas px-3 text-sm font-medium text-ink hover:bg-tint max-md:h-10"
        >
          <CalendarDays className="size-4 text-muted" aria-hidden />
          {range.label}
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <div className="w-[min(21rem,calc(100vw-2rem))]">
          <ul className="p-1.5">
            {presets.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => {
                    range.setPreset(p.key);
                    close();
                  }}
                  className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm text-ink hover:bg-tint/70 max-md:py-2.5"
                >
                  {p.label}
                  {range.preset === p.key && <Check className="size-4 stroke-[2.5] text-ink" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
          <CustomRange
            initial={range.range}
            onApply={(from, to) => {
              range.setCustom(from, to);
              close();
            }}
          />
        </div>
      )}
    </Popover>
  );
}

const GRANULARITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

export function GranularityControl() {
  const range = useDateRange();
  return <SegmentedControl label="Aggregation" options={GRANULARITY_OPTIONS} value={range.granularityChoice} onChange={range.setGranularity} />;
}
