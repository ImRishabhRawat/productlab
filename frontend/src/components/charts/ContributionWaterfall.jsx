import { METRICS } from '@product-lab/shared/constants';
import { fmtCurrency } from '../../lib/format.js';
import { moneyColumn, shortLabel } from '../../lib/metricDisplay.js';
import { useMediaQuery } from '../../lib/useMediaQuery.js';
import { BarList } from './BarList.jsx';
import { ChartCard } from './ChartCard.jsx';
import { DIVERGING, METRIC_COLORS, MUTED } from './palette.js';
import { Waterfall } from './Waterfall.jsx';

const COSTS = ['spend', 'fees', 'refunds', 'otherCosts'];
const LINES = ['revenue', ...COSTS, 'contribution'];
const lineLabel = (key) => (key === 'contribution' ? shortLabel(key) : METRICS[key].label);
const lineColor = (key, value) => (value < 0 ? DIVERGING.negative : (METRIC_COLORS[key] ?? MUTED));
const lineType = (key) => (key === 'revenue' ? 'add' : key === 'contribution' ? 'total' : 'subtract');
const negate = (v) => (v ? -v : v);

export function ContributionWaterfall({ totals, className, ...state }) {
  const narrow = useMediaQuery('(max-width: 639px)');
  const steps = LINES.filter((k) => !COSTS.includes(k) || totals?.[k]).map((k) => ({
    key: k,
    label: lineLabel(k),
    value: totals?.[k] ?? 0,
    type: lineType(k),
    color: lineColor(k, totals?.[k]),
  }));

  return (
    <ChartCard
      className={className}
      title="Revenue to contribution"
      subtitle="Ad spend and variable costs taken out of revenue"
      height={narrow ? null : 260}
      {...state}
      table={{
        rowKey: 'key',
        rows: LINES.map((k) => ({ key: k, label: lineLabel(k), value: COSTS.includes(k) ? negate(totals?.[k]) : totals?.[k] })),
        columns: [{ key: 'label', header: 'Line' }, moneyColumn('value', 'Amount')],
      }}
    >
      {narrow ? (
        <BarList
          labelWidth="7rem"
          items={steps.map((s) => ({
            key: s.key,
            label: s.label,
            value: s.value,
            color: s.color,
            display: s.type === 'subtract' ? `−${fmtCurrency(s.value)}` : undefined,
          }))}
        />
      ) : (
        <Waterfall steps={steps} />
      )}
    </ChartCard>
  );
}
