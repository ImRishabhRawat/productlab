import {
  CartesianGrid,
  DefaultZIndexes,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  usePlotArea,
  useXAxisScale,
  useYAxisScale,
  XAxis,
  YAxis,
  ZIndexLayer,
} from 'recharts';
import { fmtTick, formatValue, truncate } from '../../lib/format.js';
import { TooltipBox } from './ChartTooltip.jsx';
import { AXIS_TICK, CHART, SERIES } from './palette.js';
import { niceScale } from './scale.js';

const CHAR_WIDTH = 6.5;
const GAP = 9;
const DOT = 7;

function Point({ cx, cy, payload, color }) {
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={12} fill="transparent" />
      <circle cx={cx} cy={cy} r={5} fill={payload.__color ?? color} stroke={CHART.surface} strokeWidth={2} />
    </g>
  );
}

const axisScale = (points, axis) =>
  axis.domain ? { domain: axis.domain, ticks: axis.ticks } : niceScale(points.map((p) => p[axis.key]), { integer: axis.format === 'number' });

function lineEnd(reference, xDomain, yDomain) {
  if (!(reference?.slope > 0) || !xDomain || !yDomain) return null;
  const x = Math.min(xDomain[1], yDomain[1] / reference.slope);
  return x > 0 ? { x, y: x * reference.slope } : null;
}

const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const covers = (box, dot) => overlaps(box, { x0: dot.cx - DOT, x1: dot.cx + DOT, y0: dot.cy - DOT, y1: dot.cy + DOT });

function crosses(box, line) {
  if (!line) return false;
  const from = Math.max(box.x0, line.x1);
  const to = Math.min(box.x1, line.x2);
  if (from > to) return false;
  const at = (px) => line.y1 + ((px - line.x1) / (line.x2 - line.x1)) * (line.y2 - line.y1);
  return Math.max(at(from), at(to)) >= box.y0 && Math.min(at(from), at(to)) <= box.y1;
}

const spot = (x, y, anchor, width) => {
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { x, y, anchor, box: { x0, x1: x0 + width, y0: y - 10, y1: y + 2 } };
};

function spots({ cx, cy }, width, leftFirst) {
  const sides = [spot(cx + GAP, cy + 4, 'start', width), spot(cx - GAP, cy + 4, 'end', width)];
  return [...(leftFirst ? sides.reverse() : sides), spot(cx, cy - 10, 'middle', width), spot(cx, cy + 18, 'middle', width)];
}

function Labels({ points, x, y, labelKey, limit, end, endLabel }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  const plot = usePlotArea();
  if (!xScale || !yScale || !plot) return null;
  const right = plot.x + plot.width;
  const bottom = plot.y + plot.height;
  const dots = points.map((p) => ({
    id: p.__id,
    value: p[y.key],
    cx: xScale(p[x.key]),
    cy: yScale(p[y.key]),
    text: truncate(String(p[labelKey])),
    labelable: p.__labelable,
  }));
  const line = end && { x1: xScale(0), y1: yScale(0), x2: xScale(end.x), y2: yScale(end.y) };
  const taken = [];
  let caption = null;
  if (line && endLabel) {
    const width = endLabel.length * CHAR_WIDTH;
    caption = line.x2 - 2 - width >= plot.x ? spot(line.x2 - 2, line.y2 - 6, 'end', width) : spot(line.x2 + 4, line.y2 - 6, 'start', width);
    taken.push(caption.box);
  }
  const free = (box, dot) =>
    box.x0 >= plot.x &&
    box.x1 <= right + 16 &&
    box.y0 >= plot.y - 8 &&
    box.y1 <= bottom + 8 &&
    !taken.some((t) => overlaps(t, box)) &&
    !dots.some((o) => o !== dot && covers(box, o)) &&
    !crosses(box, line);
  const labels = [];
  for (const dot of dots.filter((d) => d.labelable).sort((a, b) => b.value - a.value)) {
    if (labels.length >= limit) break;
    const width = dot.text.length * CHAR_WIDTH;
    const found = spots(dot, width, dot.cx + GAP + width > right).find((s) => free(s.box, dot));
    if (!found) continue;
    taken.push(found.box);
    labels.push({ ...found, id: dot.id, text: dot.text });
  }
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.label}>
      <g fontSize={11}>
        {caption && (
          <text x={caption.x} y={caption.y} textAnchor={caption.anchor} fill={CHART.tick}>
            {endLabel}
          </text>
        )}
        {labels.map((l) => (
          <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} fill={CHART.label}>
            {l.text}
          </text>
        ))}
      </g>
    </ZIndexLayer>
  );
}

export function ScatterPlot({ data, x, y, labelKey = 'name', color = SERIES[0], reference, labelCount = 6, extraRows, colorFor, labelFor }) {
  const points = data
    .filter((d) => typeof d[x.key] === 'number' && typeof d[y.key] === 'number')
    .map((d, i) => ({ ...d, __id: d._id ?? i, __color: colorFor?.(d), __labelable: labelFor ? Boolean(labelFor(d)) : true }));
  const xAxis = axisScale(points, x);
  const yAxis = axisScale(points, y);
  const end = lineEnd(reference, xAxis.domain, yAxis.domain);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ top: end ? 18 : 10, right: 24, bottom: 16, left: 4 }} accessibilityLayer={false}>
        <CartesianGrid stroke={CHART.grid} />
        <XAxis
          type="number"
          dataKey={x.key}
          name={x.label}
          domain={xAxis.domain ?? [0, 'auto']}
          ticks={xAxis.ticks}
          tickFormatter={(v) => fmtTick(x.format, v)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={{ stroke: CHART.axis }}
          label={{ value: x.label, position: 'insideBottom', offset: -10, fill: CHART.tick, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey={y.key}
          name={y.label}
          domain={yAxis.domain ?? [0, 'auto']}
          ticks={yAxis.ticks}
          tickFormatter={(v) => fmtTick(y.format, v)}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={62}
          label={{ value: y.label, angle: -90, position: 'insideLeft', offset: 10, fill: CHART.tick, fontSize: 12, style: { textAnchor: 'middle' } }}
        />
        {end && <ReferenceLine segment={[{ x: 0, y: 0 }, end]} ifOverflow="hidden" stroke={CHART.ink} strokeOpacity={0.4} strokeDasharray="4 4" />}
        <Tooltip
          cursor={false}
          isAnimationActive={false}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <TooltipBox
                title={p[labelKey]}
                rows={[
                  { label: x.label, value: formatValue(x.format, p[x.key]) },
                  { label: y.label, value: formatValue(y.format, p[y.key]) },
                  ...(extraRows?.(p) ?? []),
                ]}
              />
            );
          }}
        />
        <Scatter data={points} isAnimationActive={false} shape={(props) => <Point {...props} color={color} />} />
        <Labels points={points} x={x} y={y} labelKey={labelKey} limit={labelCount} end={end} endLabel={reference?.label} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
