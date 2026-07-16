import { useFocusEffect, useRouter } from 'expo-router';
import { Clock, Plus, Target, TrendingUp, Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useMatchStats } from '@/hooks/useMatchStats';
import { fetchPendingApprovalMatches } from '@/services/matches';
import type { MatchWithProfiles } from '@/types';

function StatBlock({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Card style={[styles.statCard, { borderColor: theme.border, borderWidth: 1, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.statIconWrapper}>
        <Icon size={20} color={color} strokeWidth={2} />
      </View>
      <ThemedText variant="hero" style={[styles.statValue, { color }]}>
        {value}
      </ThemedText>
      <ThemedText variant="caption" muted style={styles.statLabel}>
        {label}
      </ThemedText>
    </Card>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { stats, loading, refresh } = useMatchStats(user?.id);

  const [pendingMatches, setPendingMatches] = useState<MatchWithProfiles[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const loadPending = useCallback(async () => {
    if (!user?.id) return;
    try {
      const data = await fetchPendingApprovalMatches(user.id);
      setPendingMatches(data);
    } catch (e) {
      console.error('Error loading pending approvals:', e);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      loadPending();
    }, [refresh, loadPending]),
  );

  const winRate = stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText variant="caption" muted>
            Welcome back
          </ThemedText>
          <ThemedText variant="title">{profile?.display_name ?? 'Player'}</ThemedText>
        </View>

        {pendingMatches.length > 0 && (
          <View style={styles.pendingSection}>
            <ThemedText variant="label" muted style={styles.sectionTitle}>
              Pending Approvals ({pendingMatches.length})
            </ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingScroll}>
              {pendingMatches.map((match) => (
                <Pressable
                  key={match.id}
                  onPress={() => {
                    setSelectedMatch(match);
                    setDetailVisible(true);
                  }}
                  style={({ pressed }) => [
                    styles.pendingCard,
                    { borderColor: theme.border, backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.pendingCardHeader}>
                    <ThemedText variant="caption" muted style={styles.pendingDate}>
                      {new Date(match.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </ThemedText>
                    <Clock size={12} color="#D97706" />
                  </View>
                  <ThemedText variant="body" style={styles.pendingTeamText} numberOfLines={1}>
                    vs {match.player?.display_name ?? 'Player'}
                  </ThemedText>
                  <ThemedText variant="caption" style={styles.pendingScoreText} muted>
                    Score: {match.player_score} – {match.opponent_score}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.statsSection}>
          <ThemedText variant="label" muted style={styles.sectionTitle}>
            Match summary
          </ThemedText>

          {loading ? (
            <ActivityIndicator color={theme.text} style={styles.loader} />
          ) : (
            <>
              <View style={styles.statsRow}>
                <StatBlock
                  label="Matches"
                  value={stats.total}
                  icon={Target}
                  color={theme.text}
                />
                <StatBlock
                  label="Wins"
                  value={stats.wins}
                  icon={Trophy}
                  color="#10B981"
                />
                <StatBlock
                  label="Losses"
                  value={stats.losses}
                  icon={TrendingUp}
                  color="#EF4444"
                />
              </View>
            </>
          )}
        </View>

        <View style={styles.center}>
          <Pressable
            onPress={() => router.push('/add-match')}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: theme.text,
                opacity: pressed ? 0.85 : 1,
                shadowColor: theme.text,
                shadowOpacity: 0.15,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 6 },
                elevation: 4,
              },
            ]}
            hitSlop={16}
            accessibilityLabel="Add new match"
            accessibilityRole="button"
          >
            <Plus size={32} color={theme.background} strokeWidth={2.5} />
          </Pressable>
          <ThemedText variant="label" muted style={styles.addLabel}>
            Add match
          </ThemedText>
        </View>
      </View>

      <MatchDetailPopup
        match={selectedMatch}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedMatch(null);
          loadPending();
          refresh();
        }}
        currentUserId={user?.id}
        onRefreshFeed={() => {
          loadPending();
          refresh();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  header: {
    paddingTop: Spacing.lg,
    gap: Spacing.xs,
  },
  statsSection: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  statIconWrapper: {
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontSize: 32,
    lineHeight: 36,
  },
  statLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 10,
  },
  loader: {
    marginVertical: Spacing.xl,
  },
  winRateCard: {
    marginTop: Spacing.xs,
    borderRadius: Radius.md,
  },
  winRateContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
  },
  winRateItem: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  winRateDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'currentColor',
    opacity: 0.2,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  addButton: {
    width: 80,
    height: 80,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    letterSpacing: 0.8,
    fontWeight: '700',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  pendingSection: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  pendingScroll: {
    gap: Spacing.sm,
    paddingRight: Spacing.lg,
  },
  pendingCard: {
    width: 160,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  pendingCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pendingDate: {
    fontSize: 10,
  },
  pendingTeamText: {
    fontWeight: '700',
    fontSize: 14,
  },
  pendingScoreText: {
    fontSize: 12,
  },
  pressed: {
    opacity: 0.75,
  },
});