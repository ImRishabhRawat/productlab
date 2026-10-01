import { ChartCard } from '../../components/charts/ChartCard.jsx';
import { ContributionWaterfall } from '../../components/charts/ContributionWaterfall.jsx';
import { Meter } from '../../components/charts/Meter.jsx';
import { Stat } from '../../components/ui/Card.jsx';
import { fmtCurrency, fmtPercent } from '../../lib/format.js';
import { metricColumn } from '../../lib/metricDisplay.js';

function marginInsight(margin) {
  if (margin == null) return null;
  const per100 = fmtCurrency(Math.round(Math.abs(margin)));
  return margin >= 0
    ? `Of every ${fmtCurrency(100)} in revenue, ${per100} is left after ads and variable costs.`
    : `Every ${fmtCurrency(100)} in revenue loses ${per100} after ads and variable costs.`;
}

function marginStanding(margin, target) {
  if (margin == null) return ['muted', ''];
  if (margin < 0) return ['critical', ' · losing money'];
  if (target == null) return ['default', ''];
  return margin >= target ? ['good', ' · on target'] : ['warning', ' · below target'];
}

export function FinancialBreakdown({ summary, target }) {
  const { current, previous } = summary.data ?? {};
  const margin = current?.contributionMargin;
  const [tone, note] = marginStanding(margin, target);
  const state = {
    loading: summary.isPending,
    fetching: summary.isFetching,
    error: summary.error,
    onRetry: summary.refetch,
    empty: summary.isSuccess && !current?.revenue && !current?.spend,
    emptyMessage: 'No revenue or ad spend in this period.',
  };
  const meters = [
    { key: 'current', label: `This period${note}`, value: margin, tone },
    ...(previous?.contributionMargin != null ? [{ key: 'previous', label: 'Previous period', value: previous.contributionMargin, tone: 'muted' }] : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <ContributionWaterfall className="lg:col-span-2" totals={current} {...state} />
      <ChartCard
        title="Margin"
        subtitle="Share of revenue kept after all costs"
        height={null}
        {...state}
        insight={marginInsight(margin)}
        table={{
          rowKey: 'period',
          rows: [{ period: 'This period', ...current }, ...(previous ? [{ period: 'Previous period', ...previous }] : [])],
          columns: [{ key: 'period', header: 'Period' }, metricColumn('contributionMargin'), metricColumn('contribution'), metricColumn('revenue')],
        }}
      >
        <div className="space-y-5">
          <Stat label="Contribution margin" value={fmtPercent(margin)} sub={`${fmtCurrency(current?.contribution)} of ${fmtCurrency(current?.revenue)} revenue`} />
          <div className="space-y-3">
            {meters.map((m, i) => (
              <Meter
                key={m.key}
                label={m.label}
                valueLabel={fmtPercent(m.value)}
                value={Math.max(m.value ?? 0, 0)}
                max={100}
                tone={m.tone}
                marker={target != null ? { value: target, label: i === meters.length - 1 ? `Target ${fmtPercent(target)}` : null } : undefined}
              />
            ))}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}
