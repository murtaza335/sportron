import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';
import { Flame, Zap, ArrowRight } from 'lucide-react-native';
import { Spacing, Radius } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useStreak } from '@/hooks/useStreak';

export function StreakHeader() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { streakCount, longestStreak, lastActivityDate, isAtRisk, refresh } = useStreak();

  if (!profile) return null;

  const hasStreak = streakCount > 0;

  return (
    <Pressable
      onPress={refresh}
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement },
        isAtRisk && [styles.atRisk, { borderColor: theme.error }],
      ]}
      hitSlop={12}
      accessibilityLabel={hasStreak ? `${streakCount} day streak` : 'Start your streak'}
      accessibilityRole="button"
    >
      <View style={styles.flameWrapper}>
        <Flame
          size={24}
          color={isAtRisk ? theme.error : theme.tabBarActive}
          strokeWidth={2}
          fill={hasStreak ? theme.tabBarActive : 'none'}
        />
      </View>

      <View style={styles.content}>
        <View style={styles.mainRow}>
          <ThemedText variant="body" style={[styles.streakNumber, { fontWeight: '700' }]}>
            {streakCount}
          </ThemedText>
          <ThemedText variant="body" muted style={styles.streakLabel}>
            {streakCount === 1 ? 'day streak' : 'day streak'}
          </ThemedText>
        </View>

        <View style={styles.subRow}>
          {hasStreak && (
            <>
              <ThemedText variant="caption" muted style={styles.longestText}>
                Best: {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
              </ThemedText>
              <View style={styles.divider} />
              <ThemedText variant="caption" muted style={styles.lastActiveText}>
                Last: {formatLastActive(lastActivityDate)}
              </ThemedText>
            </>
          )}
          {!hasStreak && (
            <ThemedText variant="caption" muted style={styles.startText}>
              Play a match or join a session to start your streak!
            </ThemedText>
          )}
        </View>
      </View>

      {isAtRisk && (
        <View style={styles.atRiskBadge}>
          <Zap size={14} color={theme.error} strokeWidth={2} />
          <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '600' }}>
            At Risk
          </ThemedText>
        </View>
      )}

      <ArrowRight size={20} color={theme.textSecondary} strokeWidth={2} />
    </Pressable>
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

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
    gap: Spacing.md,
  },
  atRisk: {
    borderColor: 'transparent',
  },
  flameWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  content: {
    flex: 1,
    gap: 2,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.xs,
  },
  streakNumber: {
    fontSize: 28,
    lineHeight: 34,
  },
  streakLabel: {
    marginTop: 2,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  longestText: {},
  divider: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  lastActiveText: {},
  startText: {},
  atRiskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
});