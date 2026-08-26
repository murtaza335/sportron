import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { Card, Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchProfile } from '@/services/profiles';
import {
  fetchCommunityById,
  fetchCommunityMember,
  fetchCommunityMemberStats,
} from '@/services/communities';
import type {
  Community,
  CommunityMember,
  CommunityMemberStats,
  Profile,
} from '@/types';
import { SPORT_LABELS } from '@/types';
import { formatDate } from '@/lib/date';
import { StreakDisplay } from '@/components/StreakDisplay';

function formatWinRatio(value: number | null | undefined): string {
  if (value == null) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n}%`;
}

export default function PublicProfileScreen() {
  const { id, community } = useLocalSearchParams<{
    id: string;
    community?: string;
  }>();
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [communityInfo, setCommunityInfo] = useState<Community | null>(null);
  const [memberStats, setMemberStats] = useState<CommunityMember | null>(null);
  const [computedStats, setComputedStats] = useState<CommunityMemberStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [profile, info, stats, computed] = await Promise.all([
          fetchProfile(id),
          community ? fetchCommunityById(community) : Promise.resolve(null),
          community ? fetchCommunityMember(community, id) : Promise.resolve(null),
          community ? fetchCommunityMemberStats(community, id) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setProfile(profile);
        setCommunityInfo(info);
        setMemberStats(stats);
        setComputedStats(computed);
      } catch (e) {
        console.error('Failed to load profile:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, community]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile?.username ?? 'Profile',
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }}>
              <X size={22} color={theme.text} strokeWidth={2} />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : !profile ? (
        <View style={styles.loader}>
          <ThemedText muted>User not found</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerSection}>
            <UserAvatar avatarUrl={profile.avatar_url} size={96} style={styles.avatar} />
            <ThemedText
              variant="hero"
              style={styles.username}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
            >
              {profile.username}
            </ThemedText>
            {profile.display_name && (
              <ThemedText variant="body" muted style={styles.displayName} numberOfLines={2}>
                {profile.display_name}
              </ThemedText>
            )}
          </View>

          {profile.bio && (
            <Card style={styles.fullWidthCard}>
              <ThemedText variant="body">{profile.bio}</ThemedText>
            </Card>
          )}

          <StreakDisplay profile={profile} />

          {memberStats && (
            <Card style={styles.fullWidthCard}>
              <View style={styles.statsHeader}>
                <ThemedText variant="label" muted numberOfLines={1} style={styles.statsLabel}>
                  Stats in {communityInfo?.name ?? 'this community'}
                </ThemedText>
                {communityInfo && (
                  <View style={[styles.sportBadge, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText variant="caption" style={styles.sportBadgeText}>
                      {SPORT_LABELS[communityInfo.sport]}
                    </ThemedText>
                  </View>
                )}
              </View>

              {memberStats.role === 'admin' && (
                <View style={[styles.adminBadge, { backgroundColor: `${theme.warning}20` }]}>
                  <ThemedText variant="caption" style={{ color: theme.warning, fontWeight: '700' }}>
                    Admin
                  </ThemedText>
                </View>
              )}

              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <ThemedText variant="heading" style={styles.statValue}>
                    {computedStats?.matches_played ?? 0}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={styles.statLabel}>
                    Matches
                  </ThemedText>
                </View>
                <View style={styles.statItem}>
                  <ThemedText variant="heading" style={styles.statValue}>
                    {computedStats?.wins ?? 0}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={styles.statLabel}>
                    Wins
                  </ThemedText>
                </View>
                <View style={styles.statItem}>
                  <ThemedText variant="heading" style={styles.statValue}>
                    {computedStats?.losses ?? 0}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={styles.statLabel}>
                    Losses
                  </ThemedText>
                </View>
              </View>

              <Divider spacing={Spacing.md} />

              <View style={styles.statRows}>
                <View style={styles.statRow}>
                  <ThemedText variant="body" muted>
                    Win rate
                  </ThemedText>
                  <ThemedText variant="body" style={styles.statRowValue}>
                    {formatWinRatio(computedStats?.win_ratio)}
                  </ThemedText>
                </View>
                <View style={styles.statRow}>
                  <ThemedText variant="body" muted>
                    Member since
                  </ThemedText>
                  <ThemedText variant="body" style={styles.statRowValue}>
                    {formatDate(memberStats.joined_at)}
                  </ThemedText>
                </View>
              </View>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  headerSection: {
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.sm,
  },
  avatar: {
    marginBottom: Spacing.xs,
  },
  username: {
    fontWeight: '800',
    textAlign: 'center',
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  displayName: {
    textAlign: 'center',
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  fullWidthCard: {
    width: '100%',
  },
  statsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  statsLabel: {
    flex: 1,
  },
  sportBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  sportBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  adminBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginBottom: Spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statRows: {
    gap: Spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statRowValue: {
    fontWeight: '700',
  },
});