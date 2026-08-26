import { Flame, Sparkles, Trophy, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface StreakModalProps {
  visible: boolean;
  onClose: () => void;
  streakCount: number;
  longestStreak?: number;
  lastActivityDate?: string | null;
}

export function StreakModal({
  visible,
  onClose,
  streakCount,
  longestStreak = 0,
  lastActivityDate = null,
}: StreakModalProps) {
  const theme = useTheme();
  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;
    setTimeout(() => setNowTs(Date.now()), 0);
    const interval = setInterval(() => {
      setNowTs(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, [visible]);

  const formattedTimeRemaining = useMemo(() => {
    if (streakCount <= 0 || !lastActivityDate) {
      return null;
    }

    const now = new Date(nowTs);
    const todayUTC = now.toISOString().split('T')[0];

    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayUTC = yesterday.toISOString().split('T')[0];

    let expiryTimestamp: number;

    if (lastActivityDate === todayUTC) {
      expiryTimestamp = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 2,
        0,
        0,
        0,
      );
    } else if (lastActivityDate === yesterdayUTC) {
      expiryTimestamp = Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0,
        0,
        0,
      );
    } else {
      return null;
    }

    const diffMs = expiryTimestamp - nowTs;
    if (diffMs <= 0) return null;

    const totalMinutes = Math.floor(diffMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      const remHours = hours % 24;
      return `${days}d ${remHours}h ${minutes}m`;
    }
    return `${hours}h ${minutes}m`;
  }, [streakCount, lastActivityDate, nowTs]);

  if (!visible) return null;

  const hasStreak = streakCount > 0;
  const streakColor = hasStreak ? theme.error : theme.textSecondary;

  const cardBackgroundColor = theme.backgroundElement;
  const cardBorderColor = theme.border;
  const buttonBgColor = theme.text;
  const buttonTextColor = theme.background;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <BlurView
          tint="dark"
          intensity={50}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, styles.darkenOverlay]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close modal backdrop" />

        <View
          style={[
            styles.card,
            {
              backgroundColor: cardBackgroundColor,
              borderColor: cardBorderColor,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <ThemedText variant="heading" style={styles.headerTitle}>Your streak</ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              style={styles.closeIconButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={theme.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          {/* Side-by-Side Streaks Section */}
          <View style={styles.statsRow}>
            {/* Current Streak */}
            <View style={styles.statBox}>
              <View style={[styles.flameCircle, { backgroundColor: hasStreak ? 'rgba(255, 87, 34, 0.1)' : 'rgba(150, 150, 150, 0.08)' }]}>
                <Flame size={24} color={streakColor} fill={streakColor} strokeWidth={0} />
              </View>
              <View style={styles.streakCountRow}>
                <Text style={[styles.streakNumber, { color: theme.text }]}>{streakCount}</Text>
                <Text style={[styles.streakUnit, { color: theme.textSecondary }]}>
                  {streakCount === 1 ? 'DAY' : 'DAYS'}
                </Text>
              </View>
              <ThemedText variant="caption" muted style={styles.statLabel}>Current Streak</ThemedText>
            </View>

            {/* Divider */}
            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {/* Best Streak */}
            <View style={styles.statBox}>
              <View style={[styles.flameCircle, { backgroundColor: 'rgba(245, 158, 11, 0.1)' }]}>
                <Trophy size={22} color={theme.warning} strokeWidth={2.2} />
              </View>
              <View style={styles.streakCountRow}>
                <Text style={[styles.streakNumber, { color: theme.text }]}>{longestStreak}</Text>
                <Text style={[styles.streakUnit, { color: theme.textSecondary }]}>
                  {longestStreak === 1 ? 'DAY' : 'DAYS'}
                </Text>
              </View>
              <ThemedText variant="caption" muted style={styles.statLabel}>Best Streak</ThemedText>
            </View>
          </View>

          {/* Resets In Timer */}
          {formattedTimeRemaining && (
            <Text style={[styles.resetText, { color: theme.textSecondary }]}>
              resets in {formattedTimeRemaining}
            </Text>
          )}

          {/* Rule Notice */}
          <View style={styles.ruleCard}>
            <Sparkles size={15} color={theme.accent} strokeWidth={2.2} style={styles.ruleIcon} />
            <ThemedText variant="caption" style={[styles.ruleText, { color: theme.textSecondary }]}>
              Maintain your streak by playing a match or participating/creating a session daily.
            </ThemedText>
          </View>

          {/* Bottom Action Button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.blackButton,
              { backgroundColor: buttonBgColor },
              pressed && styles.blackButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close streak modal"
          >
            <Text style={[styles.blackButtonText, { color: buttonTextColor }]}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const screenWidth = Dimensions.get('window').width;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
  },
  darkenOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  card: {
    width: '100%',
    maxWidth: Math.min(screenWidth - 48, 340),
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
    fontWeight: '700',
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
  },
  closeIconButton: {
    padding: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  divider: {
    width: 1,
    height: 48,
    opacity: 0.6,
  },
  flameCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  streakCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  streakNumber: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  streakUnit: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 11,
  },
  resetText: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginVertical: 2,
  },
  ruleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  ruleIcon: {
    marginTop: -2,
  },
  ruleText: {
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
  },
  blackButton: {
    backgroundColor: '#000000',
    height: 44,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginTop: Spacing.xs,
  },
  blackButtonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  blackButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});