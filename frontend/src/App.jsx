import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell.jsx';
import { ErrorState, PageLoader } from './components/ui/States.jsx';
import LoginPage from './features/auth/LoginPage.jsx';
import { DateRangeProvider } from './lib/dateRange.jsx';
import { useDeepLinks } from './lib/pwa.js';
import { useSession, useSettings } from './lib/session.js';

const TodayPage = lazy(() => import('./features/today/TodayPage.jsx'));
const GoalsPage = lazy(() => import('./features/goals/GoalsPage.jsx'));
const GoalDetailPage = lazy(() => import('./features/goals/GoalDetailPage.jsx'));
const PlanPage = lazy(() => import('./features/plan/PlanPage.jsx'));
const WeeklyReviewPage = lazy(() => import('./features/reviews/WeeklyReviewPage.jsx'));
const InsightsPage = lazy(() => import('./features/reviews/InsightsPage.jsx'));
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage.jsx'));
const OverviewPage = lazy(() => import('./features/overview/OverviewPage.jsx'));
const IdeasPage = lazy(() => import('./features/ideas/IdeasPage.jsx'));
const IdeaDetailPage = lazy(() => import('./features/ideas/IdeaDetailPage.jsx'));
const ProductsPage = lazy(() => import('./features/products/ProductsPage.jsx'));
const ProductDetailPage = lazy(() => import('./features/products/ProductDetailPage.jsx'));
const ScalingPage = lazy(() => import('./features/products/ScalingPage.jsx'));
const GraveyardPage = lazy(() => import('./features/products/GraveyardPage.jsx'));
const ExperimentsPage = lazy(() => import('./features/experiments/ExperimentsPage.jsx'));
const ExperimentDetailPage = lazy(() => import('./features/experiments/ExperimentDetailPage.jsx'));
const ExperimentComparePage = lazy(() => import('./features/experiments/ExperimentComparePage.jsx'));
const AnalyticsPage = lazy(() => import('./features/analytics/AnalyticsPage.jsx'));
const CustomersPage = lazy(() => import('./features/customers/CustomersPage.jsx'));
const OrdersPage = lazy(() => import('./features/orders/OrdersPage.jsx'));
const AIPage = lazy(() => import('./features/ai/AIPage.jsx'));
const SettingsPage = lazy(() => import('./features/settings/SettingsPage.jsx'));
const NotFoundPage = lazy(() => import('./features/NotFoundPage.jsx'));

function Workspace({ user }) {
  const settings = useSettings();
  if (settings.isPending) return <FullPage><PageLoader /></FullPage>;
  if (settings.error) return <FullPage><ErrorState error={settings.error} onRetry={settings.refetch} /></FullPage>;
  const { currency, locale, timezone } = settings.data;

  return (
    <DateRangeProvider key={`${currency}|${locale}|${timezone}`} timezone={timezone}>
      <Routes>
        <Route element={<AppShell user={user} />}>
          <Route index element={<OverviewPage />} />
          <Route path="today" element={<TodayPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="goals/:id" element={<GoalDetailPage />} />
          <Route path="plan" element={<PlanPage />} />
          <Route path="reviews" element={<Navigate to="/reviews/weekly" replace />} />
          <Route path="reviews/weekly" element={<WeeklyReviewPage />} />
          <Route path="reviews/insights" element={<InsightsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="ideas/:id" element={<IdeaDetailPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/scaling" element={<ScalingPage />} />
          <Route path="products/graveyard" element={<GraveyardPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="experiments" element={<ExperimentsPage />} />
          <Route path="experiments/compare" element={<ExperimentComparePage />} />
          <Route path="experiments/:id" element={<ExperimentDetailPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="ai" element={<AIPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </DateRangeProvider>
  );
}

function FullPage({ children }) {
  return <div className="mx-auto max-w-5xl px-6 py-10">{children}</div>;
}

export default function App() {
  const session = useSession();
  useDeepLinks();
  if (session.isPending) return <FullPage><PageLoader /></FullPage>;
  if (session.error) return <FullPage><ErrorState error={session.error} onRetry={session.refetch} /></FullPage>;
  if (!session.data) return <LoginPage />;
  return <Workspace user={session.data} />;
}
