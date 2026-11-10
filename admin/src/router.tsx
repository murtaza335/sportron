import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireRole } from './auth/RequireRole';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { NotAuthorized } from './pages/NotAuthorized';
import { Overview } from './pages/Overview';
import { Settings } from './pages/Settings';
import { Tournaments } from './pages/Tournaments';
import { TournamentNew } from './pages/TournamentNew';
import { TournamentDetail } from './pages/TournamentDetail';

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
      {
        path: 'settings',
        element: (
          <RequireRole roles={['super_admin']}>
            <Settings />
          </RequireRole>
        ),
      },
      { path: 'tournaments', element: <Tournaments /> },
      { path: 'tournaments/new', element: <TournamentNew /> },
      { path: 'tournaments/:id', element: <TournamentDetail /> },
      // The staff page is added in the next step.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
