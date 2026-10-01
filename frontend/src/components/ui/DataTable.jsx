import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { DASH } from '../../lib/format.js';

function compare(a, b) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export function DataTable({
  columns,
  rows,
  rowKey = '_id',
  onRowClick,
  initialSort = null,
  empty = 'Nothing here yet.',
  dense = false,
  maxHeight,
  caption,
}) {
  const [sort, setSort] = useState(initialSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col?.sortValue ?? ((r) => r[sort.key]);
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      if (av == null || bv == null) return compare(av, bv);
      return compare(av, bv) * dir;
    });
  }, [rows, sort, columns]);

  const toggle = (key) =>
    setSort((s) => (s?.key === key ? (s.dir === 'desc' ? { key, dir: 'asc' } : null) : { key, dir: 'desc' }));

  if (!rows.length) return <p className="py-8 text-center text-[13px] text-muted">{empty}</p>;

  return (
    <div className="overflow-auto" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-left text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="sticky top-0 z-10 bg-canvas">
          <tr className="border-b border-hairline">
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const align = c.align === 'right' ? 'justify-end text-right' : '';
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`px-3 font-medium whitespace-nowrap text-muted ${dense ? 'py-1.5' : 'py-2'} ${c.align === 'right' ? 'text-right' : ''}`}
                >
                  {c.sortable === false ? (
                    c.header
                  ) : (
                    <button type="button" onClick={() => toggle(c.key)} className={`inline-flex items-center gap-1 hover:text-ink ${align}`}>
                      {c.header}
                      {active && (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />)}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row[rowKey] ?? i}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`border-b border-hairline-soft last:border-0 ${onRowClick ? 'cursor-pointer hover:bg-tint/50' : ''}`}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3 ${dense ? 'py-1.5' : 'py-2.5'} ${c.align === 'right' ? 'text-right whitespace-nowrap tabular-nums' : ''} ${c.className ?? ''}`}
                >
                  {c.render ? c.render(row) : c.format ? c.format(row[c.key], row) : (row[c.key] ?? DASH)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
