import { useEffect, useRef } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { BellOff, CheckCheck, Settings } from 'lucide-react';
import { NOTIFICATION_CATEGORIES, PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { addDays, clockIn, isoDateIn, minutesToTime } from '@product-lab/shared/dates';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { FilterBar, PageHeader } from '../../components/ui/PageHeader.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { api } from '../../lib/api.js';
import { fmtDate, fmtNumber } from '../../lib/format.js';
import { useGet } from '../../lib/queries.js';
import { useSettings } from '../../lib/session.js';
import { useNow } from '../../lib/useNow.js';
import { useSearchParamState } from '../../lib/useSearchParamState.js';
import { EnableNotifications } from './EnableNotifications.jsx';
import { NotificationRow, useNotificationActions } from './NotificationRow.jsx';

const PAGE_SIZE = 30;
const CATEGORY_LABELS = PRODUCTIVITY_LABELS.notificationCategory;

const chipClass = (active) =>
  `inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors max-md:h-10 ${
    active ? 'border-dark bg-dark text-canvas' : 'border-hairline bg-canvas text-body hover:bg-tint'
  }`;

function groupByDay(items, timezone) {
  const groups = [];
  for (const n of items) {
    const day = isoDateIn(new Date(n.createdAt), timezone);
    if (groups.at(-1)?.day === day) groups.at(-1).items.push(n);
    else groups.push({ day, items: [n] });
  }
  return groups;
}

const clockTime = (at, timezone) => minutesToTime(clockIn(at, timezone).minutes);

function dayLabel(day, today) {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  return fmtDate(day, { weekday: true, year: day.slice(0, 4) !== today.slice(0, 4) });
}

function Filters({ unreadOnly, category, unread, onChange }) {
  const categories = useRef(null);
  const counted = unread > 0;
  useEffect(() => {
    categories.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [category, counted]);

  return (
    <FilterBar className="max-md:flex-nowrap">
      <div role="radiogroup" aria-label="Show" className="flex shrink-0 gap-1.5">
        <button
          type="button"
          role="radio"
          aria-checked={!unreadOnly}
          onClick={() => onChange({ filter: null })}
          className={chipClass(!unreadOnly)}
        >
          All
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={unreadOnly}
          onClick={() => onChange({ filter: 'unread' })}
          className={chipClass(unreadOnly)}
        >
          Unread
          {unread > 0 && <span className="tabular-nums opacity-70">{fmtNumber(unread)}</span>}
        </button>
      </div>
      <span className="h-6 w-px shrink-0 bg-hairline" aria-hidden />
      <div
        ref={categories}
        role="group"
        aria-label="Category"
        className="-m-1 flex min-w-0 flex-1 flex-wrap gap-1.5 p-1 max-md:flex-nowrap max-md:overflow-x-auto"
      >
        {NOTIFICATION_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => onChange({ category: category === c ? null : c })}
            className={chipClass(category === c)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>
    </FilterBar>
  );
}

function Empty({ unreadOnly, category, onClear }) {
  if (category || unreadOnly) {
    let title = 'No unread notifications.';
    if (category) title = unreadOnly ? `Nothing unread in ${CATEGORY_LABELS[category]}.` : `Nothing in ${CATEGORY_LABELS[category]} yet.`;
    return (
      <EmptyState
        icon={CheckCheck}
        title={title}
        description={unreadOnly ? "You're all caught up." : 'They appear here as soon as one is sent.'}
        action={<Button onClick={onClear}>Show all notifications</Button>}
      />
    );
  }
  return (
    <EmptyState
      icon={BellOff}
      title="No notifications yet."
      description="Reminders and business alerts you switch on appear here, even when push is off."
      action={
        <ButtonLink to="/settings#notifications" variant="primary">
          Choose notifications
        </ButtonLink>
      }
    />
  );
}

export default function NotificationsPage() {
  const now = useNow();
  const timezone = useSettings().data?.timezone;
  const search = useSearchParamState();
  const unreadOnly = search.get('filter') === 'unread';
  const category = NOTIFICATION_CATEGORIES.includes(search.get('category')) ? search.get('category') : '';
  const filters = { unread: unreadOnly || undefined, category: category || undefined };
  const actions = useNotificationActions();
  const unread = useGet('/notifications/unread-count').data?.unread ?? 0;
  const list = useInfiniteQuery({
    queryKey: ['get', '/notifications', filters, 'pages'],
    queryFn: ({ pageParam, signal }) => api('/notifications', { params: { ...filters, limit: PAGE_SIZE, before: pageParam }, signal }),
    initialPageParam: '',
    getNextPageParam: (last) => (last.items.length === PAGE_SIZE ? last.items.at(-1).createdAt : undefined),
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const today = isoDateIn(new Date(now), timezone);
  const clear = () => search.setMany({ filter: null, category: null });

  let content;
  if (list.isPending) {
    content = (
      <Card as="div" className="space-y-3 p-4" aria-busy="true">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </Card>
    );
  } else if (!list.data) {
    content = (
      <Card as="div">
        <ErrorState error={list.error} onRetry={list.refetch} />
      </Card>
    );
  } else if (!items.length) {
    content = (
      <Card as="div">
        <Empty unreadOnly={unreadOnly} category={category} onClear={clear} />
      </Card>
    );
  } else {
    content = (
      <div className={`space-y-5 transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
        {groupByDay(items, timezone).map((group) => (
          <section key={group.day} aria-labelledby={`day-${group.day}`}>
            <h2 id={`day-${group.day}`} className="mb-2 text-[13px] font-semibold text-muted">
              {dayLabel(group.day, today)}
            </h2>
            <Card as="div" className="overflow-hidden">
              <ul className="divide-y divide-hairline-soft">
                {group.items.map((n) => (
                  <NotificationRow
                    key={n._id}
                    notification={n}
                    onOpen={actions.open}
                    onRemove={actions.remove}
                    when={group.day === today ? undefined : clockTime(n.createdAt, timezone)}
                  />
                ))}
              </ul>
            </Card>
          </section>
        ))}
        {list.isFetchNextPageError && <ErrorState error={list.error} onRetry={list.fetchNextPage} compact />}
        {list.hasNextPage && !list.isFetchNextPageError && (
          <div className="flex justify-center">
            <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Load older
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Notifications"
        meta={unread > 0 && <Badge>{fmtNumber(unread)} unread</Badge>}
        actions={
          <>
            <Button icon={CheckCheck} disabled={!unread} onClick={actions.readAll}>
              Mark all read
            </Button>
            <ButtonLink to="/settings#notifications" variant="ghost" icon={Settings}>
              Settings
            </ButtonLink>
          </>
        }
      />
      <div className="mb-4 empty:hidden">
        <EnableNotifications compact />
      </div>
      <Filters unreadOnly={unreadOnly} category={category} unread={unread} onChange={search.setMany} />
      {content}
    </div>
  );
}
