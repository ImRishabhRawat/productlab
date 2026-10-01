import { ArrowDown, TriangleAlert } from 'lucide-react';
import { funnel } from '@product-lab/shared/metrics';
import { fmtNumber, fmtPercent } from '../../lib/format.js';
import { shortLabel } from '../../lib/metricDisplay.js';
import { ORDINAL, STATUS, TRACK } from './palette.js';

export function Funnel({ totals, compact = false }) {
  const { stages, leakIndex } = funnel(totals ?? {});
  const [impressions, ...steps] = stages;
  const base = steps[0].value;
  const width = (v) => (base > 0 ? Math.min((v / base) * 100, 100) : 0);
  const purchases = steps.at(-1);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 border-b border-hairline-soft pb-2.5">
        <span className="text-[13px] text-body">Impressions</span>
        <span className="text-right">
          <span className="text-[15px] font-semibold text-ink tabular-nums">{fmtNumber(impressions.value, { compact: true })}</span>
          <span className="ml-2 text-xs text-muted">CTR {fmtPercent(steps[0].stepRate)}</span>
        </span>
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => {
          const index = i + 1;
          const leak = index === leakIndex;
          const prevWidth = i > 0 ? width(steps[i - 1].value) : 0;
          return (
            <li key={s.key}>
              {i > 0 && (
                <div className={`mb-1 flex items-center gap-1.5 pl-0.5 text-xs ${leak ? 'font-medium text-warning' : 'text-muted'}`}>
                  {leak ? <TriangleAlert className="size-3.5" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />}
                  <span className="tabular-nums">{fmtPercent(s.stepRate)}</span> continued
                  {leak && <span>· largest drop-off{compact ? '' : `, ${fmtNumber(s.lost)} lost`}</span>}
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className={`${compact ? 'w-20' : 'w-32'} shrink-0 truncate text-[13px] text-body`} title={s.label}>
                  {compact ? shortLabel(s.key) : s.label}
                </span>
                <div className="relative h-3 min-w-0 flex-1 rounded-r-[4px]" style={{ backgroundColor: TRACK }}>
                  {leak && (
                    <div
                      className="absolute inset-y-0"
                      style={{ left: `${width(s.value)}%`, width: `${Math.max(prevWidth - width(s.value), 0)}%`, backgroundColor: `${STATUS.serious}59` }}
                      aria-hidden
                    />
                  )}
                  <div
                    className="relative h-full rounded-r-[4px]"
                    style={{ width: `${Math.max(width(s.value), s.value ? 0.8 : 0)}%`, backgroundColor: ORDINAL[Math.min(index, ORDINAL.length - 1)] }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[13px] font-semibold text-ink tabular-nums">{fmtNumber(s.value, { compact: true })}</span>
              </div>
            </li>
          );
        })}
      </ol>
      {!compact && (
        <p className="mt-3 border-t border-hairline-soft pt-2.5 text-xs text-muted">
          <span className="font-medium text-ink tabular-nums">{fmtPercent(purchases.value && base ? (purchases.value / base) * 100 : null)}</span> of clicks purchased ·{' '}
          <span className="font-medium text-ink tabular-nums">{fmtPercent(purchases.overallRate)}</span> of impressions
        </p>
      )}
    </div>
  );
}
