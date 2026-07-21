import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  approveCommunityMatch,
  disputeCommunityMatch,
  fetchCommunityMatches,
} from '@/services/communities';
import type { CommunityMatch, MatchWithProfiles } from '@/types';

function toMatchWithProfiles(cm: CommunityMatch): MatchWithProfiles {
  return {
    id: cm.id,
    created_by: cm.recorded_by,
    player_id: cm.player_id,
    player_partner_id: cm.player_partner_id,
    opponent_id: cm.opponent_id,
    opponent_partner_id: cm.opponent_partner_id,
    opponent_guest_name: null,
    match_format: 'singles',
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
    playerPartner: null,
    opponent: cm.opponent ?? null,
    opponentPartner: null,
    likes_count: 0,
    comments_count: 0,
    is_liked_by_user: false,
  };
}

export default function CommunityMatchesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const [matches, setMatches] = useState<CommunityMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchCommunityMatches(id);
      setMatches(data);
    } catch (e) {
      console.error('Failed to load matches:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleOpenPopup = (cm: CommunityMatch) => {
    setSelectedMatch(toMatchWithProfiles(cm));
    setPopupVisible(true);
  };

  const handleClosePopup = () => {
    setPopupVisible(false);
    setSelectedMatch(null);
  };

  const handleApprove = async (matchId: string) => {
    try {
      await approveCommunityMatch(matchId);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, approval_status: 'approved' } : m,
        ),
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to approve match.');
    }
  };

  const handleDispute = async (matchId: string) => {
    try {
      await disputeCommunityMatch(matchId);
      setMatches((prev) =>
        prev.map((m) =>
          m.id === matchId ? { ...m, approval_status: 'disputed' } : m,
        ),
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to dispute match.');
    }
  };

  const onApprove = async (matchId: string) => {
    await handleApprove(matchId);
    if (selectedMatch?.id === matchId) {
      setSelectedMatch((prev) =>
        prev ? { ...prev, verification_status: 'verified' } : null,
      );
    }
  };

  const onDispute = async (matchId: string) => {
    await handleDispute(matchId);
    if (selectedMatch?.id === matchId) {
      setSelectedMatch((prev) =>
        prev ? { ...prev, verification_status: 'disputed' } : null,
      );
    }
  };

  const pending = matches.filter((m) => m.approval_status === 'pending');
  const approved = matches.filter((m) => m.approval_status === 'approved');
  const disputed = matches.filter((m) => m.approval_status === 'disputed');

  const sections: { title: string; data: CommunityMatch[] }[] = [];
  if (pending.length > 0) sections.push({ title: `Pending Approval (${pending.length})`, data: pending });
  if (approved.length > 0) sections.push({ title: `Match History (${approved.length})`, data: approved });
  if (disputed.length > 0) sections.push({ title: `Disputed (${disputed.length})`, data: disputed });

  const flatItems = sections.flatMap((section) => [
    { type: 'header' as const, title: section.title, id: `h-${section.title}` },
    ...section.data.map((m) => ({ type: 'match' as const, match: m, id: m.id })),
  ]);

  const selectedCM = selectedMatch
    ? matches.find((m) => m.id === selectedMatch.id)
    : undefined;

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Match History' }} />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : (
        <FlatList
          data={flatItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.text}
            />
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <ThemedText variant="label" muted style={styles.sectionHeader}>
                  {item.title}
                </ThemedText>
              );
            }
            return (
              <MatchCard
                match={toMatchWithProfiles(item.match)}
                currentUserId={user?.id}
                onPress={() => handleOpenPopup(item.match)}
                showYoursBadge={false}
              />
            );
          }}
          ListEmptyComponent={
            <ThemedText variant="caption" muted style={styles.empty}>
              No matches recorded yet.
            </ThemedText>
          }
        />
      )}

      <MatchDetailPopup
        match={selectedMatch}
        visible={popupVisible}
        onClose={handleClosePopup}
        currentUserId={user?.id}
        onRefreshFeed={load}
        onApprove={onApprove}
        onDispute={onDispute}
        hideSocial
        hideDelete
        recordedByName={selectedCM?.recorder?.username}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  sectionHeader: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  empty: { textAlign: 'center', paddingVertical: Spacing.xxl },
});
