import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Briefcase, CalendarClock, Crosshair, NotebookPen, Repeat, Timer, Undo2, X } from 'lucide-react';
import { Link } from 'react-router';
import { PRODUCTIVITY_LABELS } from '@product-lab/shared/constants';
import { Button } from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { api } from '../../lib/api.js';
import { fmtDateTime, fmtRelative } from '../../lib/format.js';

const ICONS = {
  schedule: CalendarClock,
  outcome: Crosshair,
  focus: Timer,
  review: NotebookPen,
  habit: Repeat,
  business: Briefcase,
  system: Bell,
};
const LINK =
  'block text-[13.5px] leading-5 after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent';
const MUTATION_KEY = ['notification-actions'];
const COUNT_KEY = ['get', '/notifications/unread-count', {}];
const UNDO_MS = 5000;

const isNotifications = (q) => q.queryKey[0] === 'get' && String(q.queryKey[1]).startsWith('/notifications');
const isList = (q) => q.queryKey[0] === 'get' && q.queryKey[1] === '/notifications';
const inAppPath = (url) => (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/notifications');

function mapItems(data, update) {
  if (!data) return data;
  if (data.pages) return { ...data, pages: data.pages.map((page) => ({ ...page, items: update(page.items) })) };
  return { ...data, items: update(data.items) };
}

export function useNotificationActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { mutate } = useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn: ({ path, method }) => api(path, { method }),
    onMutate: ({ update, unread }) => {
      queryClient.setQueriesData({ predicate: isList }, (data) => mapItems(data, update));
      queryClient.setQueryData(COUNT_KEY, (data) => data && { unread: Math.max(0, unread(data.unread)) });
    },
    onError: (err) => toast.error(err),
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) === 1) queryClient.invalidateQueries({ predicate: isNotifications });
    },
  });

  const markRead = (at) => (n) => (n.readAt ? n : { ...n, readAt: at });
  const unreadAfter = (n) => (count) => (n.readAt ? count : count - 1);

  return {
    open(n) {
      if (n.readAt) return;
      const read = markRead(new Date().toISOString());
      const update = (items) => items.map((i) => (i._id === n._id ? read(i) : i));
      mutate({ path: `/notifications/${n._id}/read`, method: 'POST', update, unread: unreadAfter(n) });
    },
    remove(n) {
      const update = (items) => items.filter((i) => i._id !== n._id);
      mutate({ path: `/notifications/${n._id}`, method: 'DELETE', update, unread: unreadAfter(n) });
    },
    readAll() {
      const read = markRead(new Date().toISOString());
      mutate({ path: '/notifications/read-all', method: 'POST', update: (items) => items.map(read), unread: () => 0 });
    },
  };
}

function useUndoableRemove(n, onRemove) {
  const [deleting, setDeleting] = useState(false);
  const cancel = useRef(null);
  const commit = useEffectEvent(() => onRemove(n));

  useEffect(() => {
    if (!deleting) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      commit();
    };
    const timer = setTimeout(finish, UNDO_MS);
    cancel.current = () => {
      done = true;
    };
    return () => {
      clearTimeout(timer);
      finish();
    };
  }, [deleting]);

  const undo = () => {
    cancel.current?.();
    setDeleting(false);
  };
  return [deleting, deleting ? undo : () => setDeleting(true)];
}

export function NotificationRow({ notification: n, onOpen, onRemove, when, compact = false }) {
  const Icon = ICONS[n.category] ?? Bell;
  const unread = !n.readAt;
  const [deleting, toggleDelete] = useUndoableRemove(n, onRemove);
  const spacing = compact ? '-mx-2 rounded-md px-2 py-2.5' : 'px-4 py-3';
  return (
    <li className={`relative flex min-h-12 items-start gap-3 ${deleting ? '' : 'hover:bg-tint/40'} ${spacing}`}>
      <span
        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-tint text-body ${deleting ? 'opacity-50' : ''}`}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {deleting ? (
          <p role="status" className="truncate py-1.5 text-[13.5px] leading-5 text-muted">
            <span className="font-medium text-body">Deleted</span> · {n.title}
          </p>
        ) : (
          <>
            <Link
              to={inAppPath(n.url)}
              onClick={() => onOpen(n)}
              className={`${LINK} ${unread ? 'font-semibold text-ink' : 'text-body'} ${compact ? 'truncate' : ''}`}
            >
              {unread && <span className="sr-only">Unread: </span>}
              {n.title}
            </Link>
            {n.body && <p className={`mt-0.5 text-[13px] text-muted ${compact ? 'truncate' : 'line-clamp-2'}`}>{n.body}</p>}
            <p className="mt-1 text-xs text-muted">
              {!compact && `${PRODUCTIVITY_LABELS.notificationCategory[n.category] ?? n.category} · `}
              <time dateTime={n.createdAt} title={fmtDateTime(n.createdAt)}>
                {when ?? fmtRelative(n.createdAt)}
              </time>
            </p>
          </>
        )}
      </div>
      {unread && !deleting && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
      {onRemove && (
        <Button
          variant={deleting ? 'secondary' : 'ghost'}
          size={deleting ? 'sm' : 'icon'}
          icon={deleting ? Undo2 : X}
          aria-label={deleting ? undefined : 'Delete notification'}
          title={deleting ? undefined : 'Delete notification'}
          className="relative z-10 -my-1 -mr-2"
          onClick={toggleDelete}
        >
          {deleting && 'Undo'}
        </Button>
      )}
    </li>
  );
}
