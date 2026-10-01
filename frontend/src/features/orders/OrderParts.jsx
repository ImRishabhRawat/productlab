import { LABELS } from '@product-lab/shared/constants';
import { ORDER_KIND_COLORS } from '../../components/charts/palette.js';
import { Badge, Dot } from '../../components/ui/Badge.jsx';
import { fmtCurrency } from '../../lib/format.js';

export function ItemChips({ items }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={`${item.kind}-${i}`} title={`${item.name || LABELS.orderItemKind[item.kind]} · ${fmtCurrency(item.amount)}`}>
          <Badge>
            <Dot color={ORDER_KIND_COLORS[item.kind]} />
            {LABELS.orderItemKind[item.kind]}
          </Badge>
        </span>
      ))}
    </div>
  );
}

export function OrderAmount({ order }) {
  return (
    <>
      <div className="font-medium text-ink">{fmtCurrency(order.amount)}</div>
      {order.refundAmount > 0 && <div className="text-xs text-muted">−{fmtCurrency(order.refundAmount)}</div>}
    </>
  );
}
