import {
  ArrowRightLeft,
  Flag,
  FlaskConical,
  Gavel,
  GitBranch,
  Image,
  Lightbulb,
  Package,
  Search,
  ShoppingCart,
  SquareCheckBig,
  Tag,
} from 'lucide-react';
import { statusMeta, TONES } from '../../lib/status.js';

const ICONS = {
  idea: Lightbulb,
  validation: Search,
  created: Package,
  status: ArrowRightLeft,
  price: Tag,
  version: GitBranch,
  milestone: Flag,
  experiment: FlaskConical,
  experiment_end: SquareCheckBig,
  creative: Image,
  purchase: ShoppingCart,
  decision: Gavel,
};

export function eventColor(event) {
  if (event.type === 'decision') return statusMeta('decision', event.decision).color;
  if (event.type === 'status') return statusMeta('status', event.to).color;
  if (event.type === 'purchase') return TONES.green;
  return TONES.gray;
}

export function EventIcon({ event, className = '' }) {
  const Icon = ICONS[event.type] ?? Flag;
  const color = eventColor(event);
  return (
    <span
      className={`flex size-7 shrink-0 items-center justify-center rounded-full ${className}`}
      style={{ backgroundColor: `${color}1f`, color }}
      aria-hidden
    >
      <Icon className="size-3.5" />
    </span>
  );
}
