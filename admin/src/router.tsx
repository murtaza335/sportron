import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireRole } from './auth/RequireRole';
import { Login } from './pages/Login';
import { AuthCallback } from './pages/AuthCallback';
import { NotAuthorized } from './pages/NotAuthorized';
import { Overview } from './pages/Overview';
import { Settings } from './pages/Settings';
import { Staff } from './pages/Staff';
import { Announcements } from './pages/Announcements';
import { Config } from './pages/Config';
import { Broadcasts } from './pages/Broadcasts';
import { Tournaments } from './pages/Tournaments';
import { TournamentNew } from './pages/TournamentNew';
import { TournamentDetail } from './pages/TournamentDetail';
import { Reports } from './pages/Reports';
import { HomeRedirect } from './pages/HomeRedirect';

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
      { index: true, element: <HomeRedirect><Overview /></HomeRedirect> },
      {
        path: 'reports',
        element: (
          <RequireRole roles={['super_admin', 'moderator']}>
            <Reports />
          </RequireRole>
        ),
      },
      {
        path: 'settings',
        element: (
          <RequireRole roles={['super_admin']}>
            <Settings />
          </RequireRole>
        ),
      },
      {
        path: 'announcements',
        element: (
          <RequireRole roles={['super_admin']}>
            <Announcements />
          </RequireRole>
        ),
      },
      {
        path: 'broadcasts',
        element: (
          <RequireRole roles={['super_admin']}>
            <Broadcasts />
          </RequireRole>
        ),
      },
      {
        path: 'config',
        element: (
          <RequireRole roles={['super_admin']}>
            <Config />
          </RequireRole>
        ),
      },
      { path: 'tournaments', element: <RequireRole roles={['super_admin', 'tournament_manager']}><Tournaments /></RequireRole> },
      { path: 'tournaments/new', element: <RequireRole roles={['super_admin', 'tournament_manager']}><TournamentNew /></RequireRole> },
      { path: 'tournaments/:id', element: <RequireRole roles={['super_admin', 'tournament_manager']}><TournamentDetail /></RequireRole> },
      {
        path: 'staff',
        element: (
          <RequireRole roles={['super_admin']}>
            <Staff />
          </RequireRole>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
