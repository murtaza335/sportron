import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

// supabase-js (PKCE + detectSessionInUrl) exchanges the ?code= by itself; we just wait for the result.
export function AuthCallback() {
  const { status } = useAuth();
  if (status === 'staff') return <Navigate to="/" replace />;
  if (status === 'notStaff') return <Navigate to="/not-authorized" replace />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <div className="center muted">Signing you in…</div>;
}
