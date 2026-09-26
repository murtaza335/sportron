import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, Clock, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { fetchCommunityMatches } from '@/services/communities';
import type { CommunityMatch, MatchWithProfiles } from '@/types';
import { SPORT_LABELS } from '@/types';

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
      setMatches(pendingData);
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
              <Pressable
                key={match.id}
                onPress={() => {
                  handleMatchPress(match);
                }}
                style={({ pressed }) => [
                  styles.matchCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                  pressed && { opacity: 0.85, backgroundColor: theme.backgroundSelected },
                ]}
                hitSlop={8}
              >
                <View style={styles.matchHeader}>
                  <View style={styles.matchTypeRow}>
                    <View style={[styles.sportBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 11, color: theme.text }}>
                        {SPORT_LABELS[match.sport as keyof typeof SPORT_LABELS] || match.sport}
                      </ThemedText>
                    </View>
                    <View style={[styles.pendingBadge, { backgroundColor: `${theme.warning}20` }]}>
                      <Clock size={12} color={theme.warning} strokeWidth={2} />
                      <ThemedText variant="caption" style={{ color: theme.warning, fontWeight: '700', fontSize: 10, marginLeft: 2 }}>
                        {'PENDING'}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText variant="caption" muted style={{ fontSize: 11, color: theme.textSecondary }}>
                    {new Date(match.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </ThemedText>
                </View>

                <View style={styles.matchPlayers}>
                  <View style={styles.playerSide}>
                    <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>{'You / Partner'}</ThemedText>
                    <ThemedText variant="body" style={{ fontWeight: '600', color: theme.text }}>
                      {match.player?.username ?? 'You'}
                      {match.player_partner_id && ` & ${match.playerPartner?.username ?? 'Partner'}`}
                    </ThemedText>
                  </View>
                  <View style={styles.vsDivider}>
                    <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>{'VS'}</ThemedText>
                  </View>
                  <View style={styles.playerSide}>
                    <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>{'Opponent'}</ThemedText>
                    <ThemedText variant="body" style={{ fontWeight: '600', color: theme.text }}>
                      {match.opponent?.username ?? 'Unknown'}
                      {match.opponent_partner_id && ` & ${match.opponentPartner?.username ?? 'Partner'}`}
                    </ThemedText>
                  </View>
                </View>

                <View style={styles.matchScore}>
                  <ThemedText variant="heading" style={{ color: theme.text }}>
                    {match.player_score} - {match.opponent_score}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>
                    {match.recorded_by === user?.id ? 'Recorded by you' : 'Recorded by opponent'}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Match Detail Popup */}
      <Modal transparent visible={matchPopupVisible} animationType="fade" onRequestClose={() => { setMatchPopupVisible(false); setSelectedMatch(null); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setMatchPopupVisible(false); setSelectedMatch(null); }}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]} onPress={() => {}}>
            <View style={styles.modalInner}>
              <View style={styles.modalHeader}>
                <ThemedText variant="heading" style={{ color: theme.text }}>{'Match Detail'}</ThemedText>
                <Pressable onPress={() => { setMatchPopupVisible(false); setSelectedMatch(null); }} hitSlop={16} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                  <X size={24} color={theme.text} strokeWidth={2.5} />
                </Pressable>
              </View>
              {selectedMatch && (
                <View style={styles.modalBody}>
                  <View style={styles.detailHeader}>
                    <View style={[styles.sportBadge, { backgroundColor: theme.background, borderColor: theme.border }]}>
                      <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 11, color: theme.text }}>
                        {SPORT_LABELS[selectedMatch.sport as keyof typeof SPORT_LABELS] || selectedMatch.sport}
                      </ThemedText>
                    </View>
                    <View style={[styles.pendingBadge, { backgroundColor: `${theme.warning}20` }]}>
                      <Clock size={12} color={theme.warning} strokeWidth={2} />
                      <ThemedText variant="caption" style={{ color: theme.warning, fontWeight: '700', fontSize: 10, marginLeft: 2 }}>
                        {'PENDING'}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.detailPlayers}>
                    <View style={styles.detailSide}>
                      <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>{'You / Partner'}</ThemedText>
                      <ThemedText variant="body" style={{ fontWeight: '600', color: theme.text }}>
                        {selectedMatch.player?.username ?? 'You'}
                        {selectedMatch.player_partner_id && ` & ${selectedMatch.playerPartner?.username ?? 'Partner'}`}
                      </ThemedText>
                    </View>
                    <View style={styles.vsDivider}>
                      <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>{'VS'}</ThemedText>
                    </View>
                    <View style={styles.detailSide}>
                      <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>{'Opponent'}</ThemedText>
                      <ThemedText variant="body" style={{ fontWeight: '600', color: theme.text }}>
                        {selectedMatch.opponent?.username ?? 'Unknown'}
                        {selectedMatch.opponent_partner_id && ` & ${selectedMatch.opponentPartner?.username ?? 'Partner'}`}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.detailScore}>
                    <ThemedText variant="heading" style={{ color: theme.text, fontSize: 32 }}>
                      {selectedMatch.player_score} - {selectedMatch.opponent_score}
                    </ThemedText>
                    <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>
                      {selectedMatch.created_by === user?.id ? 'Recorded by you' : 'Recorded by opponent'}
                    </ThemedText>
                  </View>

                  <View style={styles.detailMeta}>
                    <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>
                      {new Date(selectedMatch.created_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </ThemedText>
                    <ThemedText variant="caption" muted style={{ color: theme.textSecondary }}>
                      Format: {selectedMatch.match_format === 'doubles' ? 'Doubles' : 'Singles'}
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  matchCard: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  matchTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sportBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    gap: 2,
  },
  matchPlayers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  playerSide: {
    flex: 1,
    gap: 2,
  },
  vsDivider: {
    paddingHorizontal: Spacing.sm,
  },
  matchScore: {
    alignItems: 'center',
    gap: 2,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
  },
  modalInner: {
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalBody: {
    gap: Spacing.md,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailPlayers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  detailSide: {
    flex: 1,
    gap: 2,
  },
  detailScore: {
    alignItems: 'center',
    gap: 4,
  },
  detailMeta: {
    gap: 4,
    alignItems: 'center',
  },
});