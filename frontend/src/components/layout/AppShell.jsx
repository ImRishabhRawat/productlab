import { Component, Suspense, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CalendarClock,
  ChartColumn,
  ChartLine,
  Download,
  Ellipsis,
  FlaskConical,
  Lightbulb,
  LayoutDashboard,
  LogOut,
  Package,
  ReceiptText,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Target,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useOutbox } from '../../lib/api.js';
import { fmtDateTime } from '../../lib/format.js';
import { usePushSync } from '../../lib/push.js';
import { applyUpdate, reloadAfterChunkError, useInstall, useOfflineCopy, useOnline, useUpdateReady } from '../../lib/pwa.js';
import { useGet } from '../../lib/queries.js';
import { useSignOut } from '../../lib/session.js';
import { IconButton } from '../ui/Button.jsx';
import { ErrorState, PageLoader } from '../ui/States.jsx';

const GROUPS = [
  {
    label: 'Personal',
    items: [
      { to: '/today', label: 'Today', icon: Sun },
      { to: '/goals', label: 'Goals', icon: Target },
      { to: '/plan', label: 'Plan', icon: CalendarClock },
      { to: '/reviews', label: 'Reviews', icon: ChartColumn },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/ideas', label: 'Ideas', icon: Lightbulb },
      { to: '/products', label: 'Products', icon: Package },
      { to: '/experiments', label: 'Experiments', icon: FlaskConical },
      { to: '/analytics', label: 'Analytics', icon: ChartLine },
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/orders', label: 'Orders', icon: ReceiptText },
      { to: '/ai', label: 'AI Analysis', icon: Sparkles },
    ],
  },
];

const TABS = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/', label: 'Business', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/goals', label: 'Goals', icon: Target },
];

const linkClass = (rail) => ({ isActive }) =>
  `flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors ${rail ? 'md:justify-center lg:justify-start' : 'max-md:h-11'} ${
    isActive ? 'bg-tint text-ink' : 'text-muted hover:bg-tint/60 hover:text-ink'
  }`;

export function BrandMark({ className = 'size-7' }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-md bg-primary text-canvas ${className}`}>
      <FlaskConical className="size-4" strokeWidth={2.2} aria-hidden />
    </span>
  );
}

function useUnread() {
  const { data } = useGet('/notifications/unread-count', null, { refetchInterval: 60_000, refetchOnWindowFocus: true, staleTime: 15_000 });
  return data?.unread ?? 0;
}

function CountBadge({ count, rail = false }) {
  if (!count) return null;
  const text = count > 99 ? '99+' : count;
  return (
    <span
      className={`min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular-nums ${
        rail ? 'md:absolute md:top-0.5 md:right-1 md:min-w-4 md:px-1 md:text-[10px] md:leading-4 lg:static lg:ml-auto lg:min-w-5 lg:px-1.5 lg:text-[11px] lg:leading-5' : 'ml-auto'
      }`}
    >
      {text}
    </span>
  );
}

function NavGroups({ rail = false, onNavigate }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((group) => (
        <div key={group.label}>
          <p className={`mb-1 px-2.5 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase ${rail ? 'md:sr-only lg:not-sr-only' : ''}`}>
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink to={to} end={end} title={label} onClick={onNavigate} className={linkClass(rail)}>
                  <Icon className="size-[18px] shrink-0" aria-hidden />
                  <span className={rail ? 'md:sr-only lg:not-sr-only' : ''}>{label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function UtilityLinks({ unread, rail = false, onNavigate }) {
  const { canPrompt, install } = useInstall();
  return (
    <ul className="space-y-0.5">
      <li>
        <NavLink to="/notifications" title="Notifications" onClick={onNavigate} className={(s) => `relative ${linkClass(rail)(s)}`}>
          <Bell className="size-[18px] shrink-0" aria-hidden />
          <span className={rail ? 'md:sr-only lg:not-sr-only' : ''}>Notifications</span>
          <CountBadge count={unread} rail={rail} />
          {unread > 0 && <span className="sr-only">, {unread} unread</span>}
        </NavLink>
      </li>
      <li>
        <NavLink to="/settings" title="Settings" onClick={onNavigate} className={linkClass(rail)}>
          <Settings className="size-[18px] shrink-0" aria-hidden />
          <span className={rail ? 'md:sr-only lg:not-sr-only' : ''}>Settings</span>
        </NavLink>
      </li>
      {canPrompt && (
        <li>
          <button type="button" title="Install app" onClick={install} className={`w-full ${linkClass(rail)({ isActive: false })}`}>
            <Download className="size-[18px] shrink-0" aria-hidden />
            <span className={rail ? 'md:sr-only lg:not-sr-only' : ''}>Install app</span>
          </button>
        </li>
      )}
    </ul>
  );
}

function UserFooter({ user, rail = false }) {
  const signOut = useSignOut();
  return (
    <div className={`flex items-center gap-2 border-t border-hairline px-2 pt-3 ${rail ? 'md:justify-center lg:justify-between' : 'justify-between'}`}>
      <span className={`truncate text-xs text-muted ${rail ? 'md:hidden lg:block' : ''}`} title={user.email}>
        {user.email}
      </span>
      <IconButton icon={LogOut} label="Sign out" size="icon-sm" onClick={signOut} />
    </div>
  );
}

function MoreSheet({ open, onClose, user, unread }) {
  const ref = useRef(null);
  const { ios, standalone } = useInstall();

  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector('nav a')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label="Menu"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-page text-ink shadow-md"
    >
      <div className="flex h-full flex-col px-3 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-xl font-semibold">Product Lab</span>
          </div>
          <IconButton icon={X} label="Close menu" size="icon-sm" onClick={onClose} />
        </div>
        <nav aria-label="Main" className="flex-1 space-y-4 overflow-y-auto">
          <NavGroups onNavigate={onClose} />
          <UtilityLinks unread={unread} onNavigate={onClose} />
          {ios && !standalone && (
            <Link to="/settings#app" onClick={onClose} className="block rounded-md bg-tint px-3 py-2.5 text-[13px] text-body">
              <span className="font-medium text-ink">Add to Home Screen</span> to get notifications on iPhone.
            </Link>
          )}
        </nav>
        <UserFooter user={user} />
      </div>
    </dialog>
  );
}

function BottomNav({ onMore, moreOpen }) {
  const { pathname } = useLocation();
  const inTabs = TABS.some((t) => (t.end ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`)));
  const item = 'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium';
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-hairline bg-page/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `${item} ${isActive ? 'text-primary-hover' : 'text-muted'}`}>
          <Icon className="size-5" aria-hidden />
          {label}
        </NavLink>
      ))}
      <button type="button" onClick={onMore} aria-expanded={moreOpen} className={`${item} ${!inTabs || moreOpen ? 'text-primary-hover' : 'text-muted'}`}>
        <Ellipsis className="size-5" aria-hidden />
        More
      </button>
    </nav>
  );
}

function StatusPills() {
  const online = useOnline();
  const offlineCopy = useOfflineCopy();
  const updateReady = useUpdateReady();
  const waiting = useOutbox();
  const pill = 'pointer-events-auto flex items-center gap-2 rounded-full bg-dark px-3.5 py-2 text-[13px] text-canvas shadow-md';

  const connection = !online ? "You're offline" : offlineCopy ? "Can't reach the server" : null;
  const pending = waiting > 0 && `${waiting} change${waiting === 1 ? '' : 's'} waiting to sync`;
  const offline = [connection, offlineCopy && `data from ${fmtDateTime(offlineCopy)}`, pending].filter(Boolean).join(' · ');
  if (!offline && !updateReady) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 md:bottom-4">
      {offline && (
        <p role="status" className={pill}>
          {connection ? <WifiOff className="size-4 shrink-0 text-warn" aria-hidden /> : <RefreshCw className="size-4 shrink-0 text-accent" aria-hidden />}
          {offline}
        </p>
      )}
      {updateReady && (
        <div role="status" className={pill}>
          <RefreshCw className="size-4 shrink-0 text-accent" aria-hidden />
          New version ready
          <button
            type="button"
            onClick={applyUpdate}
            className="relative rounded-full bg-canvas px-2.5 py-0.5 font-medium text-ink max-md:after:absolute max-md:after:-inset-x-1 max-md:after:-inset-y-2.5"
          >
            Reload
          </button>
        </div>
      )}
    </div>
  );
}

function useServiceWorkerMessages() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type !== 'PUSH' && event.data?.type !== 'NAVIGATE') return;
      queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'get' && String(q.queryKey[1]).startsWith('/notifications') });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [queryClient]);
}

class PageBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reloadAfterChunkError(error);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.path !== this.props.path) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorState error={{ message: 'Reload Product Lab to load the latest version of this page.' }} onRetry={() => window.location.reload()} />;
  }
}

const USER_SCROLL = ['wheel', 'touchstart', 'keydown', 'pointerdown'];

function useScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = decodeURIComponent(hash.slice(1));
    const align = () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
    const observer = new ResizeObserver(align);
    const stop = () => {
      observer.disconnect();
      clearTimeout(timer);
      USER_SCROLL.forEach((type) => window.removeEventListener(type, stop));
    };
    const timer = setTimeout(stop, 4000);
    USER_SCROLL.forEach((type) => window.addEventListener(type, stop, { passive: true }));
    observer.observe(document.body);
    align();
    return stop;
  }, [pathname, hash]);
}

function useAppBadge(count) {
  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;
    (count ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }, [count]);
}

export function AppShell({ user }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const unread = useUnread();
  usePushSync();
  useServiceWorkerMessages();
  useScrollToHash();
  useAppBadge(unread);

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-dark px-3 py-2 text-[13px] font-medium text-canvas shadow-md focus:translate-y-0"
      >
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-hairline px-2.5 py-4 md:flex md:w-16 lg:w-[220px]">
        <div className="mb-6 flex items-center gap-2.5 px-1.5 md:justify-center lg:justify-start">
          <BrandMark />
          <span className="font-display text-[21px] leading-none font-semibold tracking-[-0.01em] md:hidden lg:inline">Product Lab</span>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col justify-between gap-4 overflow-y-auto">
          <NavGroups rail />
          <UtilityLinks unread={unread} rail />
        </nav>
        <div className="mt-3">
          <UserFooter user={user} rail />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-hairline bg-page/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <Link to="/today" className="flex items-center gap-2.5">
              <BrandMark />
              <span className="font-display text-xl font-semibold">Product Lab</span>
            </Link>
            <Link
              to="/notifications"
              className="relative flex size-10 items-center justify-center rounded-md text-body hover:bg-tint"
              aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 && (
                <span className="absolute top-1 right-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          </div>
        </header>

        <MoreSheet open={open} onClose={() => setOpen(false)} user={user} unread={unread} />

        <main id="main" className="px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 md:pb-16 lg:px-8 lg:pt-7">
          <div className="mx-auto max-w-[1400px]">
            <PageBoundary path={pathname}>
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </PageBoundary>
          </div>
        </main>
      </div>

      <BottomNav onMore={() => setOpen(true)} moreOpen={open} />
      <StatusPills />
    </div>
  );
}
