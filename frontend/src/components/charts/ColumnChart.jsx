import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtBucket, fmtTick, formatValue } from '../../lib/format.js';
import { ChartTooltip } from './ChartTooltip.jsx';
import { Legend } from './Legend.jsx';
import { AXIS_TICK, CHART } from './palette.js';
import { niceScale } from './scale.js';

export function ColumnChart({ data, series, format = 'number', granularity = 'day', xKey = 'key', stacked = false, xFormatter, tooltipLabel, reference, yDomain, minTickGap = 24 }) {
  const multi = series.length > 1;
  const last = series.length - 1;
  const formatX = xFormatter ?? ((k) => fmtBucket(k, granularity));
  const withFormat = series.map((s) => ({ ...s, format: s.format ?? ((v) => formatValue(format, v)) }));
  const values = stacked ? data.map((d) => series.reduce((sum, s) => sum + (d[s.key] ?? 0), 0)) : data.flatMap((d) => series.map((s) => d[s.key]));
  const scale = yDomain ? { domain: yDomain } : niceScale([...values, reference?.value], { integer: format === 'number' });

  return (
    <div className="flex h-full flex-col">
      {multi && <Legend className="mb-3" items={series.map((s) => ({ ...s, type: 'rect' }))} />}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 20, bottom: 0, left: 0 }} barCategoryGap="22%" barGap={2} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey={xKey} tickFormatter={formatX} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: CHART.axis }} tickMargin={8} minTickGap={minTickGap} />
            <YAxis
              tickFormatter={(v) => fmtTick(format, v)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={62}
              domain={scale.domain}
              ticks={scale.ticks}
              allowDecimals={format !== 'number'}
            />
            <Tooltip
              cursor={{ fill: CHART.grid, fillOpacity: 0.6 }}
              isAnimationActive={false}
              content={<ChartTooltip series={withFormat} labelFormatter={tooltipLabel ?? (xFormatter ? formatX : (k) => fmtBucket(k, granularity, { long: true }))} />}
            />
            {reference && (
              <ReferenceLine
                y={reference.value}
                ifOverflow="extendDomain"
                stroke={CHART.ink}
                strokeOpacity={0.45}
                strokeDasharray="4 4"
                label={{ value: reference.label, position: 'insideTopRight', fill: CHART.tick, fontSize: 11 }}
              />
            )}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={stacked ? 'stack' : undefined}
                maxBarSize={24}
                radius={!stacked || i === last ? [4, 4, 0, 0] : 0}
                stroke={stacked ? CHART.surface : undefined}
                strokeWidth={stacked ? 1 : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
