import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { updateStreak, getStreakStatus } from '@/services/streak';

export function useStreak() {
  const { profile, refreshProfile } = useAuth();
  const profileId = profile?.id ?? null;
  const [streakCount, setStreakCount] = useState(profile?.streak_count ?? 0);
  const [longestStreak, setLongestStreak] = useState(profile?.longest_streak ?? 0);
  const [lastActivityDate, setLastActivityDate] = useState<string | null>(profile?.last_activity_date ?? null);
  const [isAtRisk, setIsAtRisk] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const status = await getStreakStatus(profileId);
      setStreakCount(status.streakCount);
      setLongestStreak(status.longestStreak);
      setLastActivityDate(status.lastActivityDate);
      setIsAtRisk(status.isAtRisk);
    } catch (error) {
      console.error('Failed to fetch streak:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const recordActivity = useCallback(
    async (activityType: 'match_recorded' | 'session_joined' | 'session_created') => {
      if (!profileId) return;
      try {
        const result = await updateStreak(profileId, activityType);
        if ('streakCount' in result) {
          setStreakCount(result.streakCount);
          setLongestStreak(result.longestStreak);
          setLastActivityDate(result.lastActivityDate);
          setIsAtRisk(false);
          await refreshProfile();
        }
      } catch (error) {
        console.error('Failed to update streak:', error);
      }
    },
    [profileId, refreshProfile],
  );

  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  return {
    streakCount,
    longestStreak,
    lastActivityDate,
    isAtRisk,
    loading,
    recordActivity,
    refresh,
  };
}
