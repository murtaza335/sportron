import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

export type StreakResult = {
  streakCount: number;
  longestStreak: number;
  lastActivityDate: string | null;
  streakContinued: boolean;
  streakBroken: boolean;
  isNewRecord: boolean;
};

export type StreakActivityType = 'match_recorded' | 'session_joined' | 'session_created';

const STREAK_ACTIVITY_TYPES: StreakActivityType[] = [
  'match_recorded',
  'session_joined',
  'session_created',
];

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterdayUTC(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

function computeActualStreak(
  profile: Pick<Profile, 'streak_count' | 'longest_streak' | 'last_activity_date'>
): { streakCount: number; isAtRisk: boolean; hoursSinceLastActivity: number | null } {
  const today = getTodayUTC();
  const yesterday = getYesterdayUTC();
  const lastActive = profile.last_activity_date;

  if (!lastActive) {
    return { streakCount: 0, isAtRisk: false, hoursSinceLastActivity: null };
  }

  if (lastActive === today) {
    return { streakCount: profile.streak_count ?? 0, isAtRisk: false, hoursSinceLastActivity: 0 };
  }

  if (lastActive === yesterday) {
    return { streakCount: profile.streak_count ?? 0, isAtRisk: false, hoursSinceLastActivity: 24 };
  }

  // Streak is broken - last activity was before yesterday
  const lastActiveDate = new Date(`${lastActive}T00:00:00Z`);
  const now = new Date();
  const diffMs = now.getTime() - lastActiveDate.getTime();
  const hoursSince = Math.floor(diffMs / (1000 * 60 * 60));
  const isAtRisk = hoursSince >= 22 && (profile.streak_count ?? 0) > 0;

  return { streakCount: 0, isAtRisk, hoursSinceLastActivity: hoursSince };
}

/**
 * Streaks are owned by the database (migration 105): triggers update them when a match is
 * recorded, a session is created or a commitment is accepted. This helper only asks the
 * server to (idempotently) record activity for the signed-in user and returns the result.
 * `userId` must be the signed-in user; it is kept for backwards compatibility.
 */
export async function updateStreak(
  _userId: string,
  activityType: StreakActivityType,
): Promise<StreakResult | { error: string }> {
  if (!STREAK_ACTIVITY_TYPES.includes(activityType)) {
    return { error: 'Invalid activity type' };
  }

  const { data, error } = await supabase.rpc('record_streak_activity', {
    p_activity: activityType,
  });
  if (error) return { error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: 'No streak data returned' };

  return {
    streakCount: row.streak_count ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastActivityDate: row.last_activity_date ?? null,
    streakContinued: true,
    streakBroken: false,
    isNewRecord: false,
  };
}

export async function getStreakStatus(userId: string): Promise<{
  streakCount: number;
  longestStreak: number;
  lastActivityDate: string | null;
  isAtRisk: boolean;
  hoursSinceLastActivity: number | null;
}> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('streak_count, longest_streak, last_activity_date, streak_updated_at')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return {
      streakCount: 0,
      longestStreak: 0,
      lastActivityDate: null,
      isAtRisk: false,
      hoursSinceLastActivity: null,
    };
  }

  const computed = computeActualStreak(profile);

  return {
    streakCount: computed.streakCount,
    longestStreak: profile.longest_streak ?? 0,
    lastActivityDate: profile.last_activity_date,
    isAtRisk: computed.isAtRisk,
    hoursSinceLastActivity: computed.hoursSinceLastActivity,
  };
}

export async function getUsersAtRisk(): Promise<Pick<Profile, 'id' | 'username' | 'streak_count' | 'last_activity_date' | 'fcm_tokens'>[]> {
  const yesterday = getYesterdayUTC();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, streak_count, last_activity_date, fcm_tokens')
    .gt('streak_count', 0)
    .lt('last_activity_date', yesterday)
    .is('deleted_at', null);

  if (error) {
    console.error('Failed to fetch at-risk users:', error);
    return [];
  }

  return data ?? [];
}