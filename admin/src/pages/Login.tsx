import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

export function Login() {
  const { status, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'staff') return <Navigate to="/" replace />;
  if (status === 'notStaff') return <Navigate to="/not-authorized" replace />;

  return (
    <div className="center">
      <div className="card narrow">
        <h1>Sportron Admin</h1>
        <p className="muted">Staff only. Sign in with the Google account behind your Sportron profile.</p>
        <button
          className="btn btn-primary"
          disabled={busy || status === 'loading'}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await signInWithGoogle();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Sign-in failed');
              setBusy(false);
            }
          }}
        >
          {busy ? 'Redirecting…' : 'Continue with Google'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
