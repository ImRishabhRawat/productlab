import { Bell, BellOff, Package, Pencil, Target, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import { IconButton } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Switch } from '../../components/ui/Field.jsx';
import { CategoryBadge, DayChips } from './PlanParts.jsx';
import { blockColor, reminderLabel, spanLabel } from './schedule.js';

const refLink =
  'relative inline-flex max-w-full min-w-0 items-center gap-1 hover:text-ink hover:underline max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-3';

function BlockRow({ block, enabled, busy, goal, product, off, onToggle, onEdit, onDelete }) {
  const reminders = reminderLabel(block.reminders, off);
  const ReminderIcon = reminders.live ? Bell : BellOff;
  const dim = enabled ? '' : 'opacity-60';
  return (
    <li className="grid grid-cols-[0.25rem_minmax(0,1fr)_auto] gap-x-3 px-4 py-3 lg:grid-cols-[0.25rem_minmax(0,1fr)_9.5rem_7.5rem_minmax(0,1.1fr)_auto] lg:items-center lg:gap-x-5">
      <span
        className="row-span-3 rounded-full lg:row-span-1 lg:self-stretch"
        style={{ backgroundColor: blockColor(block.category) }}
        aria-hidden
      />
      <div className={`min-w-0 self-center ${dim}`}>
        <p className="truncate text-sm font-medium text-ink">{block.name}</p>
        <p className="text-[13px] text-body">
          <span className="tabular-nums">
            {block.start}–{block.end}
          </span>
          <span className="text-muted"> · {spanLabel(block)}</span>
        </p>
      </div>
      <div className="flex items-center gap-0.5 lg:col-start-6 lg:row-start-1">
        <Switch checked={enabled} disabled={busy} label={`${block.name} enabled`} onChange={(on) => onToggle(block, on)} />
        <IconButton icon={Pencil} label={`Edit ${block.name}`} onClick={() => onEdit(block)} />
        <IconButton icon={Trash2} label={`Delete ${block.name}`} onClick={() => onDelete(block)} />
      </div>
      <div className="col-span-2 mt-2 flex flex-wrap items-center gap-2 lg:contents">
        <span className={dim}>
          <DayChips days={block.days} />
        </span>
        <span className={dim}>
          <CategoryBadge category={block.category} />
        </span>
      </div>
      <div className={`col-span-2 mt-2 min-w-0 space-y-1 text-xs text-muted lg:col-span-1 lg:mt-0 ${dim}`}>
        <p className="flex items-start gap-1.5">
          <ReminderIcon className="mt-px size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0">
            {reminders.text && <span className="sr-only">Reminders: </span>}
            {reminders.text || 'No reminders'}
          </span>
        </p>
        {(goal || product) && (
          <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 max-md:gap-y-6">
            {goal && (
              <Link to={`/goals/${goal._id}`} className={refLink}>
                <Target className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{goal.title}</span>
              </Link>
            )}
            {product && (
              <Link to={`/products/${product._id}`} className={refLink}>
                <Package className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">{product.name}</span>
              </Link>
            )}
          </p>
        )}
      </div>
    </li>
  );
}

export function BlockList({ blocks, goals, products, off, toggling, onToggle, onEdit, onDelete }) {
  const goalById = new Map(goals.map((g) => [g._id, g]));
  const productById = new Map(products.map((p) => [p._id, p]));
  return (
    <Card>
      <ul className="divide-y divide-hairline-soft">
        {blocks.map((b) => (
          <BlockRow
            key={b._id}
            block={b}
            enabled={toggling?.id === b._id ? toggling.enabled : b.enabled}
            busy={toggling?.id === b._id}
            goal={goalById.get(b.goalId)}
            product={productById.get(b.productId)}
            off={off}
            onToggle={onToggle}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </Card>
  );
}
