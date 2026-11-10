import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import type { PlatformRole } from '../lib/rpc';

/** Gate for pages. Signed out → login, not staff → "Not authorized", wrong role → overview. */
export function RequireRole({ roles, children }: { roles?: PlatformRole[]; children: ReactNode }) {
  const { status, role } = useAuth();
  if (status === 'loading') return <div className="center muted">Loading…</div>;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  if (status === 'notStaff') return <Navigate to="/not-authorized" replace />;
  if (roles && role && !roles.includes(role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
