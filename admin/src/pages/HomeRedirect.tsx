import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

/** Moderators have no Overview (the overview RPC is not theirs): their home is the Reports queue. */
export function HomeRedirect({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  if (role === 'moderator') return <Navigate to="/reports" replace />;
  return <>{children}</>;
}
