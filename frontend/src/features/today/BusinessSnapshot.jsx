import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { StatusBadge } from '../../components/ui/Badge.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader, Stat } from '../../components/ui/Card.jsx';
import { DASH, fmtCurrency, fmtNumber, fmtRatio } from '../../lib/format.js';
import { hasActivity } from '../../lib/metricDisplay.js';

export function BusinessSnapshot({ business, className = '' }) {
  const recorded = hasActivity(business);
  const top = business.topProduct;
  const today = (value) => (recorded ? value : DASH);
  return (
    <Card className={`p-4 sm:p-5 ${className}`}>
      <CardHeader
        title="Business today"
        subtitle={recorded ? 'From recorded ad metrics' : 'Nothing recorded for today yet'}
        actions={
          <ButtonLink to="/" size="sm" variant="ghost">
            Overview
          </ButtonLink>
        }
      />
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <Stat label="Revenue" value={today(fmtCurrency(business.revenue))} sub={recorded && business.roas != null ? `ROAS ${fmtRatio(business.roas)}` : null} />
        <Stat label="Ad spend" value={today(fmtCurrency(business.spend))} />
        <Stat label="Purchases" value={today(fmtNumber(business.purchases))} />
        <Stat
          label="Active experiments"
          value={fmtNumber(business.activeExperiments)}
          sub={
            business.activeExperiments > 0 && (
              <Link
                to="/experiments?status=running"
                className="relative inline-block hover:text-ink hover:underline max-md:after:absolute max-md:after:-inset-x-2 max-md:after:-inset-y-3"
              >
                View running
              </Link>
            )
          }
        />
      </div>
      <div className="mt-4 border-t border-hairline-soft pt-3">
        {top ? (
          <Link to={`/products/${top._id}`} className="group -mx-2 flex min-h-12 items-center gap-3 rounded-md px-2 py-1 hover:bg-tint">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-muted">Top product · last 7 days</p>
              <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="truncate text-[15px] font-semibold text-ink">{top.name}</span>
                <StatusBadge value={top.status} />
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink">{fmtCurrency(top.revenue)}</p>
              <p className="text-xs text-muted">revenue</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
          </Link>
        ) : (
          <p className="text-[13px] text-muted">No product revenue recorded in the last 7 days.</p>
        )}
      </div>
    </Card>
  );
}
