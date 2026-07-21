import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
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
  const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchCommunityMatches(id, user?.id);
      setMatches(data);
    } catch (e) {
      console.error('Failed to load matches:', e);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

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

  // Pending: only matches where user is the opponent (needs to approve) or the recorder
  const pendingMatches = matches.filter(
    (m) =>
      m.approval_status === 'pending' &&
      (m.opponent_id === user?.id || m.recorded_by === user?.id),
  );

  // Approved: only approved matches (disputed are hidden)
  const approvedMatches = matches.filter(
    (m) => m.approval_status === 'approved',
  );

  const displayMatches = activeTab === 'pending' ? pendingMatches : approvedMatches;

  const selectedCM = selectedMatch
    ? matches.find((m) => m.id === selectedMatch.id)
    : undefined;

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Match History' }} />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : (
        <>
          {/* Tabs */}
          <View style={[styles.tabsContainer, { borderBottomColor: theme.border }]}>
            <Pressable
              style={[
                styles.tab,
                activeTab === 'approved' && { borderBottomColor: theme.text },
              ]}
              onPress={() => setActiveTab('approved')}
            >
              <ThemedText
                variant="label"
                style={[
                  styles.tabText,
                  activeTab === 'approved' && { color: theme.text },
                  activeTab !== 'approved' && { color: theme.textSecondary },
                ]}
              >
                Approved ({approvedMatches.length})
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.tab,
                activeTab === 'pending' && { borderBottomColor: theme.text },
              ]}
              onPress={() => setActiveTab('pending')}
            >
              <ThemedText
                variant="label"
                style={[
                  styles.tabText,
                  activeTab === 'pending' && { color: theme.text },
                  activeTab !== 'pending' && { color: theme.textSecondary },
                ]}
              >
                Pending ({pendingMatches.length})
              </ThemedText>
            </Pressable>
          </View>

          {/* Match List */}
          <FlatList
            data={displayMatches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.text}
              />
            }
            renderItem={({ item }) => (
              <MatchCard
                match={toMatchWithProfiles(item)}
                currentUserId={user?.id}
                onPress={() => handleOpenPopup(item)}
                showYoursBadge={false}
              />
            )}
            ListEmptyComponent={
              <ThemedText variant="caption" muted style={styles.empty}>
                {activeTab === 'pending'
                  ? 'No pending approvals for you.'
                  : 'No approved matches yet.'}
              </ThemedText>
            }
          />
        </>
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
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
  },
  list: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  empty: { textAlign: 'center', paddingVertical: Spacing.xxl },
});
