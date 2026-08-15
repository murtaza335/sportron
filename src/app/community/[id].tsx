import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Building2,
  CheckCircle,
  ChevronRight,
  Clock,
  Globe,
  Lock,
  MapPin,
  Megaphone,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Swords,
  User,
  Users,
  X,
  XCircle,
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
import { CommunityChatPopup } from '@/components/CommunityChatPopup';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/useCommunity';
import { useCommunityChat } from '@/hooks/useCommunityChat';
import {
  fetchCommunityMatches,
  fetchCommunityMatchById,
  fetchPingResponses,
  joinCommunity,
  requestToJoinCommunity,
  sendPing,
} from '@/services/communities';
import { supabase } from '@/lib/supabase';
import type {
  CommunityMatch,
  MatchWithProfiles,
  PingResponse,
} from '@/types';
import { SPORT_LABELS } from '@/types';

export default function CommunityDetailScreen() {
  const { id, communityName, matchId: matchIdParam } = useLocalSearchParams<{
    id: string;
    communityName?: string;
    matchId?: string | string[];
  }>();
  const matchId = typeof matchIdParam === 'string' ? matchIdParam : undefined;
  const theme = useTheme();
  const { user } = useAuth();
  const {
    community,
    membership,
    joinRequests,
    myPendingInvite,
    myJoinRequest,
    loading,
    refresh,
    setMembership,
  } = useCommunity(id ?? '', user?.id);

  const isAdmin = membership?.role === 'admin';
  const isMember = !!membership;

  const communityChat = useCommunityChat(
    isMember ? (id ?? null) : null,
    user?.id,
    true,
    null,
  );

  const optimisticTitle = community?.name || communityName || '';

  const joinAction = (() => {
    if (myPendingInvite) return { label: 'Invitation Pending', disabled: true } as const;
    if (myJoinRequest) return { label: 'Request Pending', disabled: true } as const;
    if (community?.visibility === 'restricted') return { label: 'Request to Join', disabled: false } as const;
    return { label: 'Join Community', disabled: false } as const;
  })();

  // Ping responses
  const [lastPingId, setLastPingId] = useState<string | null>(null);
  const [pingResponses, setPingResponses] = useState<PingResponse[]>([]);
  const pingResponsesRef = useRef<PingResponse[]>([]);

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
    []
  );

  // Auto-open match detail when navigating from a notification tap
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchCommunityMatchById(matchId, user?.id);
        if (!cancelled && m) {
          setSelectedMatch(toMatchWithProfiles(m));
          setPopupVisible(true);
        }
      } catch (e) {
        console.error('Failed to open deep-linked match:', e);
      } finally {
        if (!cancelled) router.setParams({ matchId: undefined });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchId, user?.id, toMatchWithProfiles]);

  // Ping modal
  const [pingModalVisible, setPingModalVisible] = useState(false);
  const [pingMessage, setPingMessage] = useState('');
  const [sendingPing, setSendingPing] = useState(false);

  // Community chat
  const [chatVisible, setChatVisible] = useState(false);

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

  const handleSendPing = async () => {
    if (!id || !user || !pingMessage.trim()) return;
    setSendingPing(true);
    try {
      const pingId = await sendPing(id, user.id, pingMessage.trim());
      setLastPingId(pingId);
      setPingMessage('');
      setPingModalVisible(false);
      const responses = await fetchPingResponses(pingId);
      setPingResponses(responses);
      pingResponsesRef.current = responses;
      Alert.alert('Ping Sent', 'Notification sent to all members.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send ping.');
    } finally {
      setSendingPing(false);
    }
  };

  // Realtime subscription for ping responses
  useEffect(() => {
    if (!id || !lastPingId) return;
    const channel = supabase
      .channel(`ping-responses-${lastPingId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ping_responses',
        filter: `ping_id=eq.${lastPingId}`,
      }, (payload) => {
        const newResponse = payload.new as PingResponse;
        setPingResponses((prev) => {
          if (prev.some((r) => r.id === newResponse.id)) return prev;
          return [...prev, newResponse];
        });
        pingResponsesRef.current = [...pingResponsesRef.current, newResponse];
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, lastPingId]);

  const headerRight = () => null;
  const headerTitle = optimisticTitle
    ? () => (
        <ThemedText style={{ fontSize: 18, fontWeight: '700', maxWidth: 260 }} numberOfLines={1}>
          {optimisticTitle}
        </ThemedText>
      )
    : undefined;

  const themedHeader = {
    headerStyle: { backgroundColor: theme.background },
    headerShadowVisible: false,
    headerTintColor: theme.text,
  };

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerTitle, headerRight, ...themedHeader }} />
        <ActivityIndicator color={theme.text} style={styles.loader} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ headerTitle, headerRight, ...themedHeader }} />
        <ThemedText muted style={styles.loader}>Community not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      {/* Header Actions */}
      <Stack.Screen
        options={{
          ...themedHeader,
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

              {(community.organization || community.location) && (
                <View style={styles.communityDetails}>
                  {community.organization && (
                    <View style={styles.detailItem}>
                      <Building2 size={13} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted numberOfLines={1} style={styles.detailValue}>
                        {community.organization}
                      </ThemedText>
                    </View>
                  )}
                  {community.location && (
                    <View style={styles.detailItem}>
                      <MapPin size={13} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted numberOfLines={1} style={styles.detailValue}>
                        {community.location}
                      </ThemedText>
                    </View>
                  )}
                </View>
              )}

              {community.creator?.username && (
                <View style={styles.detailItem}>
                  <User size={13} color={theme.textSecondary} strokeWidth={2} />
                  <ThemedText variant="caption" muted numberOfLines={1} style={styles.detailValue}>
                    Created by {community.creator.username}
                  </ThemedText>
                </View>
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
                label={joinAction.label}
                icon={
                  joinAction.disabled ? (
                    <Clock size={18} color={theme.background} strokeWidth={2.5} />
                  ) : (
                    <Plus size={18} color={theme.background} strokeWidth={2.5} />
                  )
                }
                onPress={handleJoin}
                disabled={joinAction.disabled}
                buttonStyle={{ flex: 1 }}
              />
            </View>
          </>
        )}

        {/* 3. Join Requests link (Admin only) */}
        {isAdmin && (
          <Pressable
            onPress={() => id && router.navigate(`/community/${id}/join-requests`)}
            style={({ pressed }) => [
              styles.joinRequestsLink,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.border,
              },
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={4}
          >
            <View style={styles.joinRequestsLinkLeft}>
              <Users size={18} color={theme.text} strokeWidth={2} />
              <ThemedText variant="body" style={{ fontWeight: '600' }}>
                Join Requests
              </ThemedText>
            </View>
            <View style={styles.joinRequestsLinkRight}>
              {joinRequests.length > 0 && (
                <View style={[styles.requestCountBadge, { backgroundColor: '#DC2626' }]}>
                  <ThemedText style={styles.requestCountText}>
                    {joinRequests.length > 99 ? '99+' : joinRequests.length}
                  </ThemedText>
                </View>
              )}
              <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
            </View>
          </Pressable>
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
                onPress={() => setChatVisible(true)}
                style={[styles.pingButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              >
                <MessageCircle size={20} color={theme.text} strokeWidth={2} />
                {communityChat.unreadCount > 0 && (
                  <View style={styles.chatUnreadBadge}>
                    <ThemedText style={styles.chatUnreadCount} numberOfLines={1}>
                      {communityChat.unreadCount > 99 ? '99+' : communityChat.unreadCount}
                    </ThemedText>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => setPingModalVisible(true)}
                style={[styles.pingButton, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
              >
                <Megaphone size={20} color={theme.text} strokeWidth={2} />
                <View style={styles.pingDot} />
              </Pressable>
            </View>

            {/* Ping Responses */}
            {lastPingId && pingResponses.length > 0 && (
              <View style={[styles.pingResponsesSection, { borderColor: theme.border }]}>
                <ThemedText variant="label" muted style={{ fontSize: 11 }}>
                  Ping Responses ({pingResponses.length})
                </ThemedText>
                {pingResponses.map((r) => (
                  <View key={r.id} style={styles.pingResponseRow}>
                    <UserAvatar
                      avatarUrl={r.respondent?.avatar_url}
                      size={28}
                      style={{ borderWidth: 1, borderColor: theme.border }}
                    />
                    <ThemedText variant="body" style={{ flex: 1, fontWeight: '500' }}>
                      {r.respondent?.username ?? 'Someone'}
                    </ThemedText>
                    {r.response === 'coming' ? (
                      <View style={[styles.responseBadge, { backgroundColor: '#10B98120' }]}>
                        <CheckCircle size={12} color="#10B981" strokeWidth={2.5} />
                        <ThemedText variant="caption" style={{ color: '#10B981', fontWeight: '700', fontSize: 11 }}>
                          Coming
                        </ThemedText>
                      </View>
                    ) : (
                      <View style={[styles.responseBadge, { backgroundColor: '#EF444420' }]}>
                        <XCircle size={12} color="#EF4444" strokeWidth={2.5} />
                        <ThemedText variant="caption" style={{ color: '#EF4444', fontWeight: '700', fontSize: 11 }}>
                          Busy
                        </ThemedText>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

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
      />

      <CommunityChatPopup
        communityId={id ?? null}
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        currentUserId={user?.id}
        community={community}
        chat={communityChat}
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
  communityDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    maxWidth: '90%',
  },
  detailValue: {
    flexShrink: 1,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xs },

  // Join Action
  primaryActionRow: {
    marginVertical: Spacing.xs,
  },

  // Join Requests link
  section: { gap: Spacing.sm, marginTop: Spacing.xs },
  joinRequestsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  joinRequestsLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  joinRequestsLinkRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  requestCountBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  requestCountText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },

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
  chatUnreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: Radius.full,
    backgroundColor: '#EF4444',
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  chatUnreadCount: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 10,
  },
  pingResponsesSection: {
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  pingResponseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  responseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.sm,
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