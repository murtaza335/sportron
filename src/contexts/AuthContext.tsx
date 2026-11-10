import { Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { fetchOwnProfile, reEnableAccount } from '@/services/profiles';
import type { Profile } from '@/types';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  /** True when the last profile fetch FAILED (offline / 5xx) - not the same as "no profile yet". */
  profileError: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(false);
  // Latest signed-in user id; results for a previous user (fast logout/login) are ignored.
  const currentUserIdRef = useRef<string | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    try {
      const data = await fetchOwnProfile(userId);
      if (data?.deleted_at) {
        await reEnableAccount(userId);
        data.deleted_at = null;
      }
      if (currentUserIdRef.current !== userId) return;
      setProfile(data);
      setProfileError(false);
    } catch (error) {
      console.error('Failed to load profile:', error);
      // Do NOT treat a failed fetch as "no profile": the root layout would send an existing
      // user to onboarding. Surface it so a retry screen can be shown.
      if (currentUserIdRef.current === userId) setProfileError(true);
    } finally {
      if (currentUserIdRef.current === userId) setProfileLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) {
      return;
    }
    await loadProfile(session.user.id);
  }, [loadProfile, session]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      currentUserIdRef.current = currentSession?.user.id ?? null;
      setSession(currentSession);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      currentUserIdRef.current = nextSession?.user.id ?? null;
      setSession(nextSession);

      if (nextSession?.user.id) {
        // Hourly token refreshes do not change the profile: skip the reload.
        if (event !== 'TOKEN_REFRESHED') {
          loadProfile(nextSession.user.id);
        }
      } else {
        setProfile(null);
        setProfileError(false);
        setProfileLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      profileError,
      refreshProfile,
    }),
    [session, profile, loading, profileLoading, profileError, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
