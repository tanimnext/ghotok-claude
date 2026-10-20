import { Suspense } from 'react';
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router';
import { can } from '@ghotok/shared';
import { EmptyState, LoadingBlock, ToastProvider, UiProvider } from '@ghotok/ui';
import { AdminLayout } from '../components/layout/AdminLayout.jsx';
import { RouterLink } from '../components/RouterLink.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { LoginPage } from '../pages/LoginPage.jsx';
import { AppProviders } from '../providers/AppProviders.jsx';
import { useT } from '../providers/PreferencesProvider.jsx';
import { ROUTES } from './routes.js';

/** Only staff accounts get past this point; everyone else sees the login page. */
function RequireStaff() {
  const { user, isStaff, isLoading } = useAuth();
  const { t } = useT();
  if (isLoading) return <LoadingBlock label={t('common.loading')} />;
  if (!user || !isStaff) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** Renders a page only when the staff member's role has its permission. */
function Guarded({ permission, element: Page }) {
  const { user } = useAuth();
  const { t } = useT();
  if (!can(user.role, permission)) return <EmptyState icon="lock">{t('common.noAccess')}</EmptyState>;
  return (
    <Suspense fallback={<LoadingBlock label={t('common.loading')} />}>
      <Page />
    </Suspense>
  );
}

const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      element: <RequireStaff />,
      children: [
        {
          element: <AdminLayout />,
          children: ROUTES.map((r) => ({
            path: r.path,
            element: <Guarded permission={r.permission} element={r.element} />,
          })),
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ],
  { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' },
);

export function App() {
  return (
    <AppProviders>
      <UiProvider linkComponent={RouterLink}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </UiProvider>
    </AppProviders>
  );
}
