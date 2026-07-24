import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Check,
  Globe,
  Lock,
  Megaphone,
  MoreHorizontal,
  Plus,
  Swords,
  Users,
  X,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { MatchCard } from '@/components/MatchCard';
import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/useCommunity';
import {
  fetchCommunityMatches,
  joinCommunity,
  requestToJoinCommunity,
  respondToJoinRequest,
  sendPing,
} from '@/services/communities';
import type {
  CommunityJoinRequest,
  CommunityMatch,
  MatchWithProfiles,
} from '@/types';
import { SPORT_LABELS } from '@/types';

export default function CommunityDetailScreen() {
  const { id, communityName } = useLocalSearchParams<{ id: string; communityName?: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const {
    community,
    membership,
    joinRequests,
    loading,
    refresh,
    setMembership,
    setJoinRequests,
  } = useCommunity(id ?? '', user?.id);

  const isAdmin = membership?.role === 'admin';
  const isMember = !!membership;
  const optimisticTitle = community?.name || communityName || '';

  // Matches
  const [matches, setMatches] = useState<CommunityMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesPage, setMatchesPage] = useState(1);
  const [hasMoreMatches, setHasMoreMatches] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'approved' | 'pending'>('approved');

  const loadMatches = useCallback(async (page: number = 1, append: boolean = false) => {
    if (!id) return;
    try {
      const { data, hasMore } = await fetchCommunityMatches(id, user?.id, page, 10);
      if (append) {
        setMatches((prev) => [...prev, ...data]);
      } else {
        setMatches(data);
      }
      setHasMoreMatches(hasMore);
      setMatchesPage(page);
    } catch (e) {
      console.error('Failed to load matches:', e);
    } finally {
      setMatchesLoading(false);
      setLoadingMore(false);
    }
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      setMatchesPage(1);
      setHasMoreMatches(false);
      setMatchesLoading(true);
      loadMatches(1);
    }, [loadMatches]),
  );

  const handleLoadMore = async () => {
    if (loadingMore || !hasMoreMatches) return;
    setLoadingMore(true);
    await loadMatches(matchesPage + 1, true);
  };

  const approvedMatches = matches.filter((m) => m.approval_status === 'approved');

  const pendingMatches = matches.filter(
    (m) =>
      m.approval_status === 'pending' &&
      (m.opponent_id === user?.id || m.recorded_by === user?.id),
  );

  const displayMatches = activeTab === 'pending' ? pendingMatches : approvedMatches;

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

  // Ping modal
  const [pingModalVisible, setPingModalVisible] = useState(false);
  const [pingMessage, setPingMessage] = useState('');
  const [sendingPing, setSendingPing] = useState(false);

  const handleJoin = async () => {
    if (!id || !user) return;
    try {
      if (community?.visibility === 'restricted') {
        await requestToJoinCommunity(id, user.id);
        Alert.alert('Request Sent', 'The admin will review your request.');
      } else {
        await joinCommunity(id, user.id);
        setMembership({
          community_id: id,
          profile_id: user.id,
          role: 'member',
          approval_status: 'approved',
          matches_played: 0,
          wins: 0,
          losses: 0,
          win_ratio: 0,
          joined_at: new Date().toISOString(),
        });
      }
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to join.');
    }
  };

  const handleRespondToRequest = async (
    request: CommunityJoinRequest,
    status: 'approved' | 'rejected',
  ) => {
    try {
      await respondToJoinRequest(request.id, status);
      setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
      if (status === 'approved') refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to respond.');
    }
  };

  const handleSendPing = async () => {
    if (!id || !user || !pingMessage.trim()) return;
    setSendingPing(true);
    try {
      await sendPing(id, user.id, pingMessage.trim());
      setPingMessage('');
      setPingModalVisible(false);
      Alert.alert('Ping Sent', 'Notification sent to all members.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send ping.');
    } finally {
      setSendingPing(false);
    }
  };

  const headerRight = () => null;
  const headerTitle = optimisticTitle
    ? () => (
        <ThemedText style={{ fontSize: 18, fontWeight: '700', maxWidth: 260 }} numberOfLines={1}>
          {optimisticTitle}
        </ThemedText>
      )
    : undefined;

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerTitle, headerRight }} />
        <ActivityIndicator color={theme.text} style={styles.loader} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerTitle, headerRight }} />
        <ThemedText muted style={styles.loader}>Community not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header Actions */}
      <Stack.Screen
        options={{
          headerTitle: () =>
            isMember ? (
              <Pressable
                onPress={() => router.navigate(`/community/${id}/info`)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.5 : 1,
                })}
              >
                <ThemedText
                  style={{ fontSize: 18, fontWeight: '700', maxWidth: 260 }}
                  numberOfLines={1}
                >
                  {optimisticTitle}
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText
                style={{ fontSize: 18, fontWeight: '700', maxWidth: 260 }}
                numberOfLines={1}
              >
                {optimisticTitle}
              </ThemedText>
            ),
          headerRight: () =>
            isMember ? (
              <View>
                <Pressable onPress={() => router.navigate(`/community/${id}/info`)} hitSlop={12} style={styles.headerIcon}>
                  <MoreHorizontal size={22} color={theme.text} strokeWidth={2} />
                </Pressable>
              </View>
            ) : null,
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
          refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => { refresh(); setMatchesLoading(true); setMatchesPage(1); setHasMoreMatches(false); loadMatches(1); }}
            tintColor={theme.text}
          />
        }
      >
        {/* 1. Info Card + Join Action (Non-members only) */}
        {!isMember && (
          <>
            <Card style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <ThemedText variant="heading" style={{ flex: 1 }}>
                  {community.name}
                </ThemedText>
                <View
                  style={[
                    styles.visibilityBadgeSmall,
                    {
                      backgroundColor: community.visibility === 'public' ? '#10B98120' : '#D9770620',
                    },
                  ]}
                >
                  {community.visibility === 'public' ? (
                    <Globe size={12} color="#10B981" strokeWidth={2.5} />
                  ) : (
                    <Lock size={12} color="#D97706" strokeWidth={2.5} />
                  )}
                  <ThemedText
                    variant="caption"
                    style={{
                      color: community.visibility === 'public' ? '#10B981' : '#D97706',
                      fontWeight: '700',
                      fontSize: 11,
                    }}
                  >
                    {community.visibility === 'public' ? 'Public' : 'Restricted'}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.sportBadgeRow}>
                <View style={[styles.sportBadgeSmall, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                  <Swords size={12} color={theme.textSecondary} strokeWidth={2} />
                  <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>
                    {SPORT_LABELS[community.sport] || community.sport}
                  </ThemedText>
                </View>
              </View>

              {community.description && (
                <ThemedText variant="body" muted style={styles.description}>
                  {community.description}
                </ThemedText>
              )}

              <View style={styles.metaRow}>
                <Users size={14} color={theme.textSecondary} strokeWidth={2} />
                <ThemedText variant="caption" muted>
                  {community.member_count ?? 0} member{(community.member_count ?? 0) !== 1 ? 's' : ''}
                </ThemedText>
              </View>
            </Card>

            <View style={styles.primaryActionRow}>
              <Button
                label={community.visibility === 'restricted' ? 'Request to Join' : 'Join Community'}
                icon={<Plus size={18} color={theme.background} strokeWidth={2.5} />}
                onPress={handleJoin}
                buttonStyle={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {/* 3. Join Requests (Admin Only Alerts) */}
        {isAdmin && joinRequests.length > 0 && (
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionTitle}>
              Join Requests ({joinRequests.length})
            </ThemedText>
            {joinRequests.map((req) => (
              <Card key={req.id} style={styles.requestCard}>
                <View style={styles.requestInfo}>
                  <View style={[styles.avatar, { backgroundColor: theme.textSecondary }]}>
                    <ThemedText style={[styles.avatarText, { color: theme.background }]}>
                      {(req.profile?.username ?? '?').charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {req.profile?.username ?? 'Unknown'}
                  </ThemedText>
                </View>
                <View style={styles.requestActions}>
                  <Pressable
                    onPress={() => handleRespondToRequest(req, 'approved')}
                    style={[styles.actionChip, { backgroundColor: '#10B98120', borderColor: '#10B98140' }]}
                  >
                    <Check size={14} color="#10B981" strokeWidth={3} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleRespondToRequest(req, 'rejected')}
                    style={[styles.actionChip, { backgroundColor: '#EF444420', borderColor: '#EF444440' }]}
                  >
                    <X size={14} color="#EF4444" strokeWidth={3} />
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* 4. Matches Section */}
        {isMember && (
          <View style={styles.section}>
            {/* Record Match + Ping Bar */}
            <View style={styles.recordMatchBar}>
              <Button
                label="Record Match"
                icon={<Swords size={18} color={theme.background} strokeWidth={2} />}
                onPress={() => router.navigate(`/add-match?communityId=${id}&sport=${community.sport}`)}
                buttonStyle={styles.recordMatchButton}
              />
              <Pressable
                onPress={() => setPingModalVisible(true)}
                style={[styles.pingButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              >
                <Megaphone size={20} color={theme.text} strokeWidth={2} />
                <View style={styles.pingDot} />
              </Pressable>
            </View>

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
            {matchesLoading ? (
              <ActivityIndicator color={theme.textSecondary} style={{ paddingVertical: Spacing.lg }} />
            ) : displayMatches.length > 0 ? (
              <>
                {displayMatches.map((cm) => (
                  <MatchCard
                    key={cm.id}
                    match={toMatchWithProfiles(cm)}
                    currentUserId={user?.id}
                    onPress={() => {
                      setSelectedMatch(toMatchWithProfiles(cm));
                      setPopupVisible(true);
                    }}
                    showYoursBadge={false}
                  />
                ))}
                {activeTab === 'approved' && hasMoreMatches && (
                  <Pressable
                    onPress={handleLoadMore}
                    style={[styles.loadMoreButton, { borderColor: theme.border }]}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color={theme.textSecondary} />
                    ) : (
                      <ThemedText variant="body" style={{ fontWeight: '600', color: theme.textSecondary }}>
                        Load More
                      </ThemedText>
                    )}
                  </Pressable>
                )}
              </>
            ) : (
              <Card>
                <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
                  {activeTab === 'pending'
                    ? 'No pending approvals for you.'
                    : 'No matches recorded yet. Be the first to record one!'}
                </ThemedText>
              </Card>
            )}
          </View>
        )}

      </ScrollView>

      {/* Ping Modal */}
      <Modal transparent visible={pingModalVisible} animationType="fade" onRequestClose={() => setPingModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPingModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <ThemedText variant="heading">Ping Everyone</ThemedText>
              <Pressable onPress={() => setPingModalVisible(false)} hitSlop={16}>
                <X size={18} color={theme.text} strokeWidth={2.5} />
              </Pressable>
            </View>
            <TextInput
              placeholder="What's up? (e.g. Playing tennis now!)"
              placeholderTextColor={theme.textSecondary}
              value={pingMessage}
              onChangeText={setPingMessage}
              style={[
                styles.pingInput,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              multiline
              maxLength={200}
            />
            <Button
              label="Send Ping"
              onPress={handleSendPing}
              loading={sendingPing}
              disabled={!pingMessage.trim()}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <MatchDetailPopup
        match={selectedMatch}
        visible={popupVisible}
        onClose={() => { setPopupVisible(false); setSelectedMatch(null); }}
        currentUserId={user?.id}
        onRefreshFeed={loadMatches}
        hideSocial
        hideDelete
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
    gap: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  
  headerIcon: {
    padding: Spacing.xs,
  },

  // Non-member Info Card
  infoCard: { gap: Spacing.sm },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  visibilityBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  sportBadgeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  sportBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  description: { marginTop: Spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },

  // Join Action
  primaryActionRow: {
    marginVertical: Spacing.xs,
  },

  // Admin Alerts
  section: { gap: Spacing.sm, marginTop: Spacing.xs },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  requestInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  requestActions: { flexDirection: 'row', gap: Spacing.xs },
  actionChip: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },

  // Matches Section
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
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
  recordMatchBar: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  recordMatchButton: {
    flex: 1,
  },
  pingButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pingDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    backgroundColor: '#EF4444',
  },
  loadMoreButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
  },
  viewAllLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    marginTop: -Spacing.sm,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
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
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editImagePicker: {
    width: '100%',
    height: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImagePreview: {
    width: '100%',
    height: 120,
  },
  editImageRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  pingInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  editInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
  },
  editInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  visibilityToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  visibilityOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  transferAdminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  }
});