import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Clock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { MatchCard } from '@/components/MatchCard';
import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { fetchCommunityMatches } from '@/services/communities';
import type { CommunityMatch, MatchWithProfiles } from '@/types';

export default function PendingMatchesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const [matches, setMatches] = useState<CommunityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [matchPopupVisible, setMatchPopupVisible] = useState(false);

  const toMatchWithProfiles = useCallback(
    (cm: CommunityMatch): MatchWithProfiles => {
      return {
        id: cm.id,
        created_by: cm.recorded_by,
        player_id: cm.player_id,
        player_partner_id: cm.player_partner_id,
        opponent_id: cm.opponent_id,
        opponent_partner_id: cm.opponent_partner_id,
        opponent_guest_name: null,
        match_format: cm.player_partner_id || cm.opponent_partner_id ? 'doubles' : 'singles',
        sport: cm.sport,
        custom_sport_name: cm.custom_sport_name,
        team_a_name: cm.team_a_name,
        team_b_name: cm.team_b_name,
        player_score: cm.player_score,
        opponent_score: cm.opponent_score,
        is_public: true,
        verification_status:
          cm.approval_status === 'approved'
            ? 'verified'
            : cm.approval_status === 'disputed'
              ? 'disputed'
              : 'pending',
        created_at: cm.created_at,
        player: cm.player ?? null,
        playerPartner: cm.playerPartner ?? null,
        opponent: cm.opponent ?? null,
        opponentPartner: cm.opponentPartner ?? null,
        likes_count: cm.likes_count ?? 0,
        comments_count: cm.comments_count ?? 0,
        is_liked_by_user: cm.is_liked_by_user ?? false,
      };
    },
    [],
  );

  const handleMatchPress = useCallback((match: CommunityMatch) => {
    setSelectedMatch(toMatchWithProfiles(match));
    setMatchPopupVisible(true);
  }, [toMatchWithProfiles]);

  const loadMatches = useCallback(async () => {
    if (!id || !user) return;
    try {
      const { data } = await fetchCommunityMatches(id, user?.id, 1, 50);
      const pendingData = data.filter((m) => m.approval_status === 'pending' && (m.recorded_by === user?.id || m.opponent_id === user?.id));
      // Sort: matches where current user is opponent (needs to approve) first, then matches recorded by user
      const sorted = [...pendingData].sort((a, b) => {
        const aIsOpponent = a.opponent_id === user?.id;
        const bIsOpponent = b.opponent_id === user?.id;
        if (aIsOpponent && !bIsOpponent) return -1;
        if (!aIsOpponent && bIsOpponent) return 1;
        return 0;
      });
      setMatches(sorted);
    } catch (e) {
      console.error('Failed to load pending matches:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadMatches();
  }, [loadMatches]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadMatches();
    }, [loadMatches]),
  );

  const themedHeader = {
    headerStyle: { backgroundColor: theme.background },
    headerShadowVisible: false,
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    headerLeft: () => (
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [
          { marginLeft: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
          pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 0.92 }] },
        ]}
      >
        <ChevronLeft size={24} color={theme.text} />
      </Pressable>
    ),
  };

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ ...themedHeader, headerTitle: () => <ThemedText style={{ fontSize: 18, fontWeight: '700', color: theme.text }}>{'Pending Matches'}</ThemedText> }} />
        <ActivityIndicator color={theme.text} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          ...themedHeader,
          headerTitle: () => (
            <ThemedText style={{ fontSize: 18, fontWeight: '700', maxWidth: 260, color: theme.text }} numberOfLines={1}>
              {'Pending Matches'}
            </ThemedText>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.text}
          />
        }
      >
        {matches.length === 0 ? (
          <View style={styles.emptyState}>
            <Clock size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="heading" style={{ marginTop: Spacing.md, color: theme.textSecondary }}>
              {'No Pending Matches'}
            </ThemedText>
            <ThemedText variant="body" muted style={{ marginTop: Spacing.xs, textAlign: 'center', paddingHorizontal: Spacing.lg, color: theme.textSecondary }}>
              {'You have no pending matches to review.'}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.list}>
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={toMatchWithProfiles(match)}
                currentUserId={user?.id}
                showYoursBadge={false}
                communityId={id}
                onPress={() => handleMatchPress(match)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <MatchDetailPopup
        match={selectedMatch}
        visible={matchPopupVisible}
        onClose={() => { setMatchPopupVisible(false); setSelectedMatch(null); }}
        currentUserId={user?.id}
        communityId={id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  list: {
    gap: Spacing.md,
  },
});