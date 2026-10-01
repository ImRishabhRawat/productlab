export function TooltipBox({ title, rows }) {
  return (
    <div className="min-w-36 rounded-md border border-hairline bg-canvas px-3 py-2 text-xs shadow-md">
      {title && <div className="mb-1.5 font-medium text-muted">{title}</div>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key ?? r.label} className="flex items-center gap-2">
            {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />}
            <span className="font-semibold text-ink tabular-nums">{r.value}</span>
            <span className="text-muted">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartTooltip({ active, payload, label, series, labelFormatter }) {
  if (!active || !payload?.length) return null;
  const rows = payload
    .filter((p) => p.dataKey !== '__base')
    .map((p) => {
      const s = series?.find((x) => x.key === p.dataKey);
      return {
        key: p.dataKey,
        color: s?.color ?? p.color,
        value: s?.format ? s.format(p.value, p.payload) : p.value,
        label: s?.label ?? p.name,
      };
    });
  return <TooltipBox title={labelFormatter ? labelFormatter(label, payload) : label} rows={rows} />;
}
