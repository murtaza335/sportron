import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';
import { notifyStreakMilestone } from './notifications';

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

export async function computeStreak(
  profile: Pick<Profile, 'streak_count' | 'longest_streak' | 'last_activity_date' | 'streak_updated_at'>,
  activityDate: string = getTodayUTC()
): Promise<StreakResult> {
  const today = getTodayUTC();
  const yesterday = getYesterdayUTC();
  const lastActive = profile.last_activity_date;

  let streakCount = profile.streak_count ?? 0;
  let longestStreak = profile.longest_streak ?? 0;
  let streakContinued = false;
  let streakBroken = false;
  let isNewRecord = false;

  if (!lastActive) {
    streakCount = 1;
    streakContinued = true;
  } else if (lastActive === today) {
    streakContinued = true;
  } else if (lastActive === yesterday) {
    streakCount += 1;
    streakContinued = true;
  } else {
    streakBroken = true;
    streakCount = 1;
  }

  if (streakCount > longestStreak) {
    longestStreak = streakCount;
    isNewRecord = true;
  }

  return {
    streakCount,
    longestStreak,
    lastActivityDate: activityDate,
    streakContinued,
    streakBroken,
    isNewRecord,
  };
}

export async function updateStreak(
  userId: string,
  activityType: StreakActivityType,
  activityDate: string = getTodayUTC()
): Promise<StreakResult | { error: string }> {
  if (!STREAK_ACTIVITY_TYPES.includes(activityType)) {
    return { error: 'Invalid activity type' };
  }

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('streak_count, longest_streak, last_activity_date, streak_updated_at')
    .eq('id', userId)
    .single();

  if (fetchError) {
    return { error: fetchError.message };
  }

  const result = await computeStreak(profile, activityDate);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      streak_count: result.streakCount,
      longest_streak: result.longestStreak,
      last_activity_date: result.lastActivityDate,
      streak_updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    return { error: updateError.message };
  }

  // Trigger milestone notification if this is a new record and hits a milestone
  const MILESTONES = [3, 7, 14, 30, 60, 100];
  if (result.isNewRecord && MILESTONES.includes(result.streakCount)) {
    notifyStreakMilestone(userId, result.streakCount).catch((e) =>
      console.error('[streak] Failed to send milestone notification:', e)
    );
  }

  return result;
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

  const lastActive = profile.last_activity_date;
  let hoursSinceLastActivity: number | null = null;
  let isAtRisk = false;

  if (lastActive) {
    const lastActiveDate = new Date(`${lastActive}T00:00:00Z`);
    const now = new Date();
    const diffMs = now.getTime() - lastActiveDate.getTime();
    hoursSinceLastActivity = Math.floor(diffMs / (1000 * 60 * 60));
    isAtRisk = hoursSinceLastActivity >= 22 && profile.streak_count > 0;
  }

  return {
    streakCount: profile.streak_count ?? 0,
    longestStreak: profile.longest_streak ?? 0,
    lastActivityDate: profile.last_activity_date,
    isAtRisk,
    hoursSinceLastActivity,
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