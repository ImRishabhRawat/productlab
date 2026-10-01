import { fmtNumber } from '../../lib/format.js';
import { CHART, SEQUENTIAL, sequentialColor } from './palette.js';

export function Heatmap({ labels, matrix, format = (v) => fmtNumber(v), caption }) {
  const max = Math.max(0, ...matrix.flat());
  const darkFrom = SEQUENTIAL[7];
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th />
            {labels.map((l) => (
              <th key={l} scope="col" className="max-w-24 truncate px-1 pb-1 text-left font-medium text-muted" title={l}>
                {l}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={labels[i]}>
              <th scope="row" className="max-w-36 truncate pr-2 text-left font-medium text-body" title={labels[i]}>
                {labels[i]}
              </th>
              {row.map((v, j) => {
                const bg = sequentialColor(v, max);
                const dark = SEQUENTIAL.indexOf(bg) >= SEQUENTIAL.indexOf(darkFrom);
                return (
                  <td
                    key={labels[j]}
                    title={`${labels[i]} × ${labels[j]}: ${format(v)}`}
                    className={`h-9 min-w-14 rounded-[4px] text-center font-medium tabular-nums ${dark ? 'text-white' : 'text-ink'}`}
                    style={{ backgroundColor: v ? bg : CHART.grid }}
                  >
                    {v ? format(v) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
