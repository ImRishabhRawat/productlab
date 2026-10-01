import { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtBucket, fmtTick, formatValue } from '../../lib/format.js';
import { ChartTooltip } from './ChartTooltip.jsx';
import { Legend } from './Legend.jsx';
import { AXIS_TICK, CHART } from './palette.js';
import { niceScale } from './scale.js';

function isolatedDot(data, key, color) {
  return function IsolatedDot({ cx, cy, index }) {
    const prev = data[index - 1]?.[key];
    const next = data[index + 1]?.[key];
    if (cx == null || cy == null || data[index]?.[key] == null || prev != null || next != null) return null;
    return <circle key={`${key}-${index}`} cx={cx} cy={cy} r={3} fill={color} stroke={CHART.surface} strokeWidth={1.5} />;
  };
}

export function TrendChart({ data, series, format = 'number', granularity = 'day', xKey = 'key', area = false, reference, connectNulls = false, yDomain }) {
  const keys = series.map((s) => s.key).join('|');
  const [toggled, setToggled] = useState({ keys, hidden: new Set() });
  const hidden = toggled.keys === keys ? toggled.hidden : new Set();
  const multi = series.length > 1;
  const withFormat = series.map((s) => ({ ...s, format: s.format ?? ((v) => formatValue(format, v)) }));
  const toggle = (key) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else if (next.size < series.length - 1) next.add(key);
    setToggled({ keys, hidden: next });
  };
  const visible = series.filter((s) => !hidden.has(s.key));
  const scale = yDomain
    ? { domain: yDomain }
    : niceScale([...data.flatMap((d) => visible.map((s) => d[s.key])), reference?.value], { integer: format === 'number' });

  return (
    <div className="flex h-full flex-col">
      {multi && <Legend className="mb-3" items={series.map((s) => ({ ...s, type: 'line' }))} hidden={hidden} onToggle={toggle} />}
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey={xKey}
              tickFormatter={(k) => fmtBucket(k, granularity)}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART.axis }}
              tickMargin={8}
              minTickGap={32}
            />
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
              cursor={{ stroke: CHART.axis, strokeWidth: 1 }}
              isAnimationActive={false}
              content={<ChartTooltip series={withFormat} labelFormatter={(k) => fmtBucket(k, granularity, { long: true })} />}
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
            {visible.map((s) =>
                area && !multi ? (
                  <Area
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.color}
                    strokeWidth={2}
                    fill={s.color}
                    fillOpacity={0.1}
                    dot={connectNulls ? false : isolatedDot(data, s.key, s.color)}
                    activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
                    connectNulls={connectNulls}
                    isAnimationActive={false}
                  />
                ) : (
                  <Line
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    type="monotone"
                    stroke={s.color}
                    strokeWidth={2}
                    dot={connectNulls ? false : isolatedDot(data, s.key, s.color)}
                    activeDot={{ r: 4, stroke: CHART.surface, strokeWidth: 2 }}
                    connectNulls={connectNulls}
                    isAnimationActive={false}
                  />
                ),
              )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
