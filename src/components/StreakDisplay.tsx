import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';
import { Flame } from 'lucide-react-native';
import { Radius, Spacing } from '@/constants/theme';
import type { Profile } from '@/types';

interface StreakDisplayProps {
  profile: Profile;
  compact?: boolean;
}

export function StreakDisplay({ profile, compact = false }: StreakDisplayProps) {
  const theme = useTheme();
  const streakCount = profile.streak_count ?? 0;
  const longestStreak = profile.longest_streak ?? 0;
  const lastActivityDate = profile.last_activity_date;
  const hasStreak = streakCount > 0;

  if (!hasStreak && compact) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundElement }]}>
      <View style={styles.header}>
        <View style={styles.iconWrapper}>
          <Flame size={20} color={theme.tabBarActive} strokeWidth={2} fill={theme.tabBarActive} />
        </View>
        <ThemedText variant="label" style={styles.title}>
          Streak
        </ThemedText>
      </View>

      <View style={compact ? styles.compactRow : styles.mainRow}>
        <View style={styles.statColumn}>
          <ThemedText
            variant="hero"
            style={[
              styles.streakNumber,
              compact ? { fontSize: 28, lineHeight: 34 } : { fontSize: 48, lineHeight: 56 },
            ]}
          >
            {streakCount}
          </ThemedText>
          <ThemedText variant="caption" muted style={styles.streakLabel}>
            {streakCount === 1 ? 'Day' : 'Days'}
          </ThemedText>
        </View>

        {!compact && (
          <>
            <View style={styles.divider} />
            <View style={styles.statColumn}>
              <ThemedText variant="heading" style={styles.bestNumber}>
                {longestStreak}
              </ThemedText>
              <ThemedText variant="caption" muted style={styles.bestLabel}>
                Best
              </ThemedText>
            </View>
            <View style={styles.divider} />
            <View style={styles.statColumn}>
              <ThemedText variant="heading" style={styles.lastNumber}>
                {formatLastActive(lastActivityDate)}
              </ThemedText>
              <ThemedText variant="caption" muted style={styles.lastLabel}>
                Last Active
              </ThemedText>
            </View>
          </>
        )}
      </View>

      {!compact && hasStreak && (
        <View style={styles.motivation}>
          <ThemedText variant="body" muted style={styles.motivationText}>
            {getMotivationText(streakCount, longestStreak)}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function formatLastActive(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(`${dateStr}T00:00:00Z`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.getTime() === today.getTime()) return 'Today';
  if (date.getTime() === yesterday.getTime()) return 'Yesterday';

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getMotivationText(current: number, best: number): string {
  if (current === 0) return 'Play a match or join a session to start your streak!';
  if (current >= best && best > 0) return `🔥 New personal best! ${current} days strong!`;
  if (current >= 7) return `💪 ${current} days and counting — consistency is key!`;
  if (current >= 3) return `⭐ ${current} days! You're building a habit!`;
  return `Keep it up! ${current} day${current === 1 ? '' : 's'} in a row!`;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  iconWrapper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  title: {
    fontWeight: '700',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: Spacing.xs,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  statColumn: {
    alignItems: 'center',
    flex: 1,
  },
  streakNumber: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '800',
  },
  streakLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bestNumber: {
    fontSize: 24,
    fontWeight: '700',
  },
  bestLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lastNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  lastLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 40,
    opacity: 0.2,
  },
  motivation: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  motivationText: {
    textAlign: 'center',
  },
});
