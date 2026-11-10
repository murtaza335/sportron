import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireRole } from './auth/RequireRole';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { NotAuthorized } from './pages/NotAuthorized';
import { Overview } from './pages/Overview';

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/auth/callback', element: <AuthCallback /> },
  { path: '/not-authorized', element: <NotAuthorized /> },
  {
    path: '/',
    element: (
      <RequireRole>
        <Layout />
      </RequireRole>
    ),
    children: [
      { index: true, element: <Overview /> },
      // Pages for tournaments, settings and staff are added in the next steps.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
