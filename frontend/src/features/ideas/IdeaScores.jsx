import { IDEA_STATUSES, LABELS } from '@product-lab/shared/constants';
import { Meter, ScoreBar } from '../../components/charts/Meter.jsx';
import { choices, DASH } from '../../lib/format.js';

export const OPEN_STATUSES = ['idea', 'researching', 'ready_to_test'];
export const STATUS_OPTIONS = choices(IDEA_STATUSES.filter((s) => s !== 'converted'), LABELS.status);

export const SCORE_ROWS = [
  { key: 'demand', label: 'Demand signal', short: 'Demand', note: 'Average of the four validation signals' },
  { key: 'ease', label: 'Ease of production', short: 'Ease', note: '10 minus production effort' },
  { key: 'demonstrability', label: 'Ad demonstrability', short: 'Demonstrability', note: 'Ad demonstrability' },
  { key: 'repeat', label: 'Repeat potential', short: 'Repeat', note: 'Repeat purchase potential' },
  { key: 'risk', label: 'Legal / IP risk', short: 'Risk', note: 'Lower is safer', invert: true },
];

export function Potential({ scores, large = false }) {
  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <p className="flex items-baseline gap-1.5">
          <span className={`leading-none font-semibold tracking-[-0.02em] text-ink ${large ? 'text-[48px]' : 'text-[26px]'}`}>
            {scores.potential ?? DASH}
          </span>
          <span className="text-xs text-muted">/ 100 potential</span>
        </p>
        {scores.potentialLevel && <span className="text-xs font-medium text-muted">{LABELS.level[scores.potentialLevel]}</span>}
      </div>
      <Meter value={scores.potential} max={100} height={large ? 8 : 6} />
    </div>
  );
}

export function ScoreList({ scores, compact = false }) {
  const rows = compact ? SCORE_ROWS.filter((r) => !r.invert) : SCORE_ROWS;
  return (
    <div
      className={
        compact
          ? 'space-y-1.5 [&>div]:grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] [&>div]:gap-2'
          : 'space-y-2.5 [&>div]:grid-cols-[8.5rem_minmax(0,1fr)_2.75rem]'
      }
    >
      {rows.map((r) => (
        <ScoreBar key={r.key} label={compact ? r.short : r.label} value={scores[r.key]} invert={r.invert} note={r.note} />
      ))}
    </div>
  );
}
