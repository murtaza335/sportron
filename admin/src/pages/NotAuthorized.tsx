import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function NotAuthorized() {
  const { status, signOut } = useAuth();
  if (status === 'staff') return <Navigate to="/" replace />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return (
    <div className="center">
      <div className="card narrow">
        <h1>Not authorized</h1>
        <p className="muted">
          This account is not Sportron staff. Sign out and try the Google account linked to your staff profile, or
          ask a super admin to add you.
        </p>
        <button className="btn" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
