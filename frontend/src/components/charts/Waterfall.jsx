import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtTick, formatValue } from '../../lib/format.js';
import { TooltipBox } from './ChartTooltip.jsx';
import { AXIS_TICK, CHART, DIVERGING, SERIES } from './palette.js';

function waterfallData(steps, fmt) {
  const data = [];
  let running = 0;
  for (const [i, s] of steps.entries()) {
    const start = s.type === 'total' || i === 0 ? 0 : running;
    const end = s.type === 'total' ? running : s.type === 'subtract' ? start - s.value : start + s.value;
    if (s.type !== 'total') running = end;
    const signed = s.type === 'subtract' ? -s.value : s.type === 'total' ? end : s.value;
    data.push({
      label: s.label,
      range: [Math.min(start, end), Math.max(start, end)],
      signed,
      text: s.type === 'total' || i === 0 ? fmt(signed) : `${s.type === 'subtract' ? '−' : '+'}${fmt(Math.abs(signed))}`,
      color: s.color ?? (s.type === 'subtract' ? DIVERGING.negative : s.type === 'total' ? (end < 0 ? DIVERGING.negative : CHART.label) : SERIES[0]),
    });
  }
  return data;
}

export function Waterfall({ steps, format = 'currency' }) {
  const fmt = (v) => formatValue(format, v);
  const data = waterfallData(steps, fmt);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="24%" accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} tickMargin={8} interval={0} />
        <YAxis tickFormatter={(v) => fmtTick(format, v)} tick={AXIS_TICK} tickLine={false} axisLine={false} width={62} />
        <ReferenceLine y={0} stroke={CHART.axis} />
        <Tooltip
          cursor={{ fill: CHART.grid, fillOpacity: 0.6 }}
          isAnimationActive={false}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox rows={[{ label: payload[0].payload.label, value: fmt(payload[0].payload.signed), color: payload[0].payload.color }]} />
            ) : null
          }
        />
        <Bar dataKey="range" maxBarSize={56} radius={3} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.color} />
          ))}
          <LabelList dataKey="text" position="top" fill={CHART.label} fontSize={11} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
