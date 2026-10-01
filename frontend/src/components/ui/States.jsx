import { CircleAlert, Inbox, Loader2 } from 'lucide-react';
import { Button } from './Button.jsx';

export function Skeleton({ className = '', style }) {
  return <div className={`skeleton rounded-md ${className}`} style={style} aria-hidden />;
}

export function Spinner({ className = '' }) {
  return <Loader2 className={`size-4 animate-spin text-muted ${className}`} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, compact = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'} ${className}`}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-tint text-muted">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'py-14'}`} role="alert">
      <CircleAlert className="mb-2 size-5 text-negative" aria-hidden />
      <p className="text-sm font-medium text-ink">Couldn&apos;t load this</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{error?.message ?? 'Something went wrong.'}</p>
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={() => onRetry()}>
          Try again
        </Button>
      )}
    </div>
  );
}
