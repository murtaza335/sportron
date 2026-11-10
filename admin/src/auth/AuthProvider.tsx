import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { rpc, type PlatformRole } from '../lib/rpc';

// loading → signedOut | notStaff | staff. The site never creates profiles: no profile or no staff
// role both end up as "notStaff" (the database is the real gate; this only shapes the UI).
export type AuthStatus = 'loading' | 'signedOut' | 'notStaff' | 'staff';

interface AuthValue {
  status: AuthStatus;
  session: Session | null;
  role: PlatformRole | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<PlatformRole | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const resolve = useCallback(async (s: Session | null) => {
    setSession(s);
    if (!s) {
      setRole(null);
      setStatus('signedOut');
      return;
    }
    try {
      const r = await rpc.myRole();
      setRole(r);
      setStatus(r ? 'staff' : 'notStaff');
    } catch {
      setRole(null);
      setStatus('notStaff');
    }
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) void resolve(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      // Token refreshes keep the same user: don't flash the loading state or re-check the role.
      if (event === 'TOKEN_REFRESHED') {
        setSession(s);
        return;
      }
      // Defer: supabase calls must not run inside this callback.
      setTimeout(() => void resolve(s), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [resolve]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({ status, session, role, signInWithGoogle, signOut }),
    [status, session, role, signInWithGoogle, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
