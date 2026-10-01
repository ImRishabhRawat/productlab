import { BellOff } from 'lucide-react';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Card, CardHeader } from '../../components/ui/Card.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { fmtNumber } from '../../lib/format.js';
import { useGet } from '../../lib/queries.js';
import { useNow } from '../../lib/useNow.js';
import { NotificationRow, useNotificationActions } from './NotificationRow.jsx';

const COUNT = 3;

export function LatestNotifications({ className = '' }) {
  useNow();
  const actions = useNotificationActions();
  const unreadCount = useGet('/notifications/unread-count').data?.unread ?? 0;
  const unread = useGet('/notifications', { unread: true, limit: COUNT });
  const unreadItems = unread.data?.items ?? [];
  const fill = unread.isSuccess && unreadItems.length < COUNT;
  const latest = useGet('/notifications', { limit: COUNT }, { enabled: fill });
  const shown = new Set(unreadItems.map((n) => n._id));
  const items = [...unreadItems, ...(fill ? (latest.data?.items ?? []).filter((n) => !shown.has(n._id)) : [])].slice(0, COUNT);
  const error = unread.error ?? (fill ? latest.error : null);

  let content;
  if (unread.isPending || (fill && latest.isPending)) {
    content = (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: COUNT }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  } else if (error && !items.length) {
    content = <ErrorState error={error} onRetry={() => (unread.error ? unread.refetch() : latest.refetch())} compact />;
  } else if (!items.length) {
    content = (
      <EmptyState
        compact
        icon={BellOff}
        title="No notifications yet."
        description="Reminders and alerts you switch on show up here."
        action={
          <ButtonLink to="/settings#notifications" size="sm">
            Choose notifications
          </ButtonLink>
        }
      />
    );
  } else {
    content = (
      <ul>
        {items.map((n) => (
          <NotificationRow key={n._id} notification={n} onOpen={actions.open} compact />
        ))}
      </ul>
    );
  }

  return (
    <Card className={`p-4 ${className}`}>
      <CardHeader
        title="Notifications"
        subtitle={unreadCount ? `${fmtNumber(unreadCount)} unread` : 'All caught up'}
        actions={
          <ButtonLink to="/notifications" variant="ghost" size="sm" className="-mr-1.5">
            View all
          </ButtonLink>
        }
        className="mb-2"
      />
      {content}
    </Card>
  );
}
