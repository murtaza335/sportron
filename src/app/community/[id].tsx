import { FABMenu } from '@/components/FABMenu';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Building2,
  Camera,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Lock,
  MapPin,
  MoreHorizontal,
  Plus,
  Sparkles,
  Swords,
  User,
  Users,
  X
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { CommunityChatPopup } from '@/components/CommunityChatPopup';
import { CreatePostModal } from '@/components/CreatePostModal';
import { MatchCard } from '@/components/MatchCard';
import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { PostCard } from '@/components/PostCard';
import { PostDetailPopup } from '@/components/PostDetailPopup';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/useCommunity';
import { useCommunityChat } from '@/hooks/useCommunityChat';
import { useCommunityPosts } from '@/hooks/useCommunityPosts';
import { alert } from '@/lib/alert';
import { supabase } from '@/lib/supabase';
import {
  fetchCommunityMatchById,
  fetchCommunityMatches,
  fetchJoinRequests,
  getNextPingTime,
  joinCommunity,
  requestToJoinCommunity,
  sendPing,
} from '@/services/communities';
import type {
  CommunityJoinRequest,
  CommunityMatch,
  CommunityPost,
  MatchWithProfiles,
} from '@/types';
import { SPORT_LABELS } from '@/types';

export default function CommunityDetailScreen() {
  const { id, communityName, matchId: matchIdParam, postId: postIdParam } = useLocalSearchParams<{
    id: string;
    communityName?: string;
    matchId?: string | string[];
    postId?: string | string[];
  }>();
  const matchId = typeof matchIdParam === 'string' ? matchIdParam : undefined;
  const postId = typeof postIdParam === 'string' ? postIdParam : undefined;
  const theme = useTheme();
  const { user } = useAuth();
  const {
    community,
    membership,
    myPendingInvite,
    myJoinRequest,
    loading,
    refresh,
    setMembership,
  } = useCommunity(id ?? '', user?.id);

  const isAdmin = membership?.role === 'admin';
  const isMember = !!membership;

  // Join requests — admin only
  const [joinRequests, setJoinRequests] = useState<CommunityJoinRequest[]>([]);

  // Pending matches — realtime
  const [pendingMatches, setPendingMatches] = useState<CommunityMatch[]>([]);

  const communityChat = useCommunityChat(
    isMember ? (id ?? null) : null,
    user?.id,
    true,
    null,
  );

  // Posts feed
  const {
    posts,
    loading: postsLoading,
    refresh: refreshPosts,
    loadMore: loadMorePosts,
    loadingMore: loadingMorePosts,
    hasMore: hasMorePosts,
  } = useCommunityPosts(id ?? null, user?.id ?? null);

  // Matches
  const [matches, setMatches] = useState<CommunityMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [matchesPage, setMatchesPage] = useState(1);
  const [hasMoreMatches, setHasMoreMatches] = useState(false);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [matchPopupVisible, setMatchPopupVisible] = useState(false);
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [postPopupVisible, setPostPopupVisible] = useState(false);
  const [createPostModalVisible, setCreatePostModalVisible] = useState(false);
  const [createPostInitialTab, setCreatePostInitialTab] = useState<'write' | 'photo'>('write');

  // Ping state
  const [pingMessage, setPingMessage] = useState('');
  const [sendingPing, setSendingPing] = useState(false);
  const [pingCooldownUntil, setPingCooldownUntil] = useState<Date | null>(null);
  const [nowTs, setNowTs] = useState<number>(() => Date.now());
  const [showPingModal, setShowPingModal] = useState(false);

  const optimisticTitle = community?.name || communityName || '';

  const joinAction = (() => {
    if (myPendingInvite) return { label: 'Invitation Pending', disabled: true } as const;
    if (myJoinRequest) return { label: 'Request Pending', disabled: true } as const;
    if (community?.visibility === 'restricted') return { label: 'Request to Join', disabled: false } as const;
    return { label: 'Join Community', disabled: false } as const;
  })();

  const loadMatches = useCallback(async (page: number = 1, append: boolean = false) => {
    if (!id) return;
    try {
      const { data, hasMore } = await fetchCommunityMatches(id, user?.id, page, 10);
      if (append) {
        setMatches((prev) => {
          const existingIds = new Set(prev.map(m => m.id));
          const newMatches = data.filter(m => !existingIds.has(m.id));
          return [...prev, ...newMatches];
        });
      } else {
        setMatches(data);
      }
      setHasMoreMatches(hasMore);
      setMatchesPage(page);
    } catch (e) {
      console.error('Failed to load matches:', e);
    } finally {
      setMatchesLoading(false);
      setLoadingMoreMatches(false);
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

  // Join requests — admin only
  useFocusEffect(
    useCallback(() => {
      if (!id || !isAdmin) return;
      let cancelled = false;
      (async () => {
        try {
          const requests = await fetchJoinRequests(id);
          if (!cancelled) setJoinRequests(requests);
        } catch (e) {
          console.error('Failed to load join requests:', e);
        }
      })();
      return () => { cancelled = true; };
    }, [id, isAdmin]),
  );

  // Pending matches — realtime
  const pendingMatchesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!id || !user) return;

    const channel = supabase
      .channel(`community-pending-${id}-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_matches',
          filter: `community_id=eq.${id}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const match = payload.new as CommunityMatch;
          if (match.approval_status === 'pending' && (match.opponent_id === user.id || match.recorded_by === user.id)) {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              setPendingMatches((prev) => {
                if (prev.some((m) => m.id === match.id)) {
                  return prev.map((m) => (m.id === match.id ? match : m));
                }
                return [match, ...prev];
              });
            } else if (payload.eventType === 'DELETE') {
              setPendingMatches((prev) => prev.filter((m) => m.id !== (payload.old as { id: string }).id));
            }
          }
        },
      )
      .subscribe();

    pendingMatchesChannelRef.current = channel;

    return () => {
      if (pendingMatchesChannelRef.current) {
        supabase.removeChannel(pendingMatchesChannelRef.current);
        pendingMatchesChannelRef.current = null;
      }
    };
  }, [id, user]);

  const feedMatches = matches.filter((m) => m.approval_status !== 'pending');
  const pendingFromFeed = matches.filter(
    (m) => m.approval_status === 'pending' && (m.recorded_by === user?.id || m.opponent_id === user?.id),
  );
  const allPendingMatches = [
    ...pendingFromFeed,
    ...pendingMatches.filter(
      (pm) => pm.approval_status === 'pending'
        && (pm.recorded_by === user?.id || pm.opponent_id === user?.id)
        && !pendingFromFeed.some((m) => m.id === pm.id),
    ),
  ];

  // Combine posts and approved matches into unified feed
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

  const combinedFeed = useMemo(() => {
    const feedItems: Array<{ type: 'post'; data: CommunityPost } | { type: 'match'; data: MatchWithProfiles }> = [];

    // Add posts
    (posts ?? []).forEach((post) => {
      feedItems.push({ type: 'post', data: post });
    });

    // Add approved matches (deduplicated by id)
    const seenMatchIds = new Set<string>();
    (matches ?? []).forEach((match) => {
      if (!seenMatchIds.has(match.id)) {
        seenMatchIds.add(match.id);
        feedItems.push({ type: 'match', data: toMatchWithProfiles(match) });
      }
    });

    // Sort by created_at descending
    feedItems.sort((a, b) => {
      const dateA = new Date(a.type === 'post' ? a.data.created_at : a.data.created_at).getTime();
      const dateB = new Date(b.type === 'post' ? b.data.created_at : b.data.created_at).getTime();
      return dateB - dateA;
    });

    return feedItems;
  }, [posts, matches, toMatchWithProfiles]);

  const feedContent = useMemo(() => {
    // Inline styles for skeleton loader
    const skeletonContainerStyle = { padding: Spacing.lg, gap: Spacing.md };
    const skeletonCardStyle = { backgroundColor: theme.backgroundElement, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm };
    const skeletonLineStyle = { height: 16, borderRadius: Radius.sm, backgroundColor: theme.border };
    const skeletonLineShortStyle = { height: 16, borderRadius: Radius.sm, backgroundColor: theme.border, width: '60%' as const };

    // Caught up card styles
    const caughtUpCardStyle = {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: Spacing.sm,
      padding: Spacing.lg,
      marginTop: Spacing.md,
      borderRadius: Radius.lg,
      backgroundColor: theme.success + '15',
      borderWidth: 1,
      borderColor: theme.success,
    };

    if (postsLoading && combinedFeed.length === 0) {
      return (
        <View style={skeletonContainerStyle}>
          {[...Array(3)].map((_, i) => (
            <View key={i} style={skeletonCardStyle}>
              <View style={skeletonLineStyle} />
              <View style={skeletonLineShortStyle} />
              <View style={skeletonLineStyle} />
            </View>
          ))}
        </View>
      );
    }
    if (combinedFeed.length > 0) {
      return (
        <>
          {combinedFeed.map((item, index) => (
            <Pressable
              key={`${item.type}-${item.data.id}`}
              onPress={() => {
                if (item.type === 'post') {
                  handlePostPress(item.data);
                } else {
                  handleMatchPress(item.data);
                }
              }}
              style={({ pressed }) => [styles.feedItem, pressed && styles.pressedFeedItem]}
              hitSlop={8}
            >
              {item.type === 'post' ? (
                <PostCard
                  post={item.data}
                  currentUserId={user?.id}
                  communityId={id}
                  showYoursBadge={false}
                  onPress={() => handlePostPress(item.data)}
                />
              ) : (
                <MatchCard
                  match={item.data}
                  currentUserId={user?.id}
                  communityId={id}
                  showYoursBadge={false}
                />
              )}
            </Pressable>
          ))}
          {(postsLoading || loadingMorePosts || loadingMoreMatches) && (
            <View style={styles.loadMoreContainer}>
              <ActivityIndicator size="small" color={theme.textSecondary} />
            </View>
          )}
          {!hasMorePosts && !hasMoreMatches && combinedFeed.length > 0 && !postsLoading && !loadingMorePosts && !loadingMoreMatches && (
            <View
              style={{
                position: 'relative',
                overflow: 'hidden',
                minHeight: 260,
                borderRadius: Radius.lg,
                backgroundColor: theme.backgroundElement,
                paddingVertical: Spacing.xl,
                paddingHorizontal: Spacing.lg,
                alignItems: 'center',
                justifyContent: 'center',
                marginVertical: Spacing.md,
              }}
            >
              {/* Background Graphic Accents */}
              <View
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 180,
                  height: 180,
                  borderRadius: 90,
                  backgroundColor: theme.borderMuted,
                  opacity: 0.1,
                }}
              />
              <View
                aria-hidden
                style={{
                  position: 'absolute',
                  bottom: -50,
                  left: -30,
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  backgroundColor: theme.borderMuted,
                  opacity: 0.12,
                }}
              />

              {/* Content */}
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: Radius.full,
                  backgroundColor: theme.backgroundSelected,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: Spacing.md,
                }}
              >
                <CheckCircle size={32} color={theme.text} strokeWidth={2} />
              </View>

              <ThemedText
                variant="body"
                style={{
                  fontWeight: '700',
                  fontSize: 18,
                  color: theme.text,
                  marginTop: Spacing.xs,
                }}
              >
                You're all caught up!
              </ThemedText>

              <ThemedText
                variant="caption"
                style={{
                  color: theme.textSecondary,
                  marginTop: Spacing.xs,
                  textAlign: 'center',
                  fontSize: 13,
                }}
              >
                No more posts or matches to show right now
              </ThemedText>
            </View>
          )}
        </>
      );
    }
    if (combinedFeed.length === 0 && !postsLoading) {
      return (
        <View
          style={{
            position: 'relative',
            overflow: 'hidden',
            minHeight: 280,
            borderRadius: Radius.lg,
            backgroundColor: theme.backgroundElement,
            borderWidth: 1,
            borderColor: theme.border,
            paddingVertical: Spacing.lg,
            paddingHorizontal: Spacing.lg,
            alignItems: 'center',
            justifyContent: 'center',
            marginVertical: Spacing.md,
          }}
        >
          {/* Background Decorative Rings */}
          <View
            aria-hidden
            style={{
              position: 'absolute',
              top: -40,
              right: -40,
              width: 180,
              height: 180,
              borderRadius: 90,
              borderWidth: 16,
              borderColor: '#E1306C',
              opacity: 0.1,
            }}
          />
          <View
            aria-hidden
            style={{
              position: 'absolute',
              bottom: -50,
              left: -50,
              width: 200,
              height: 200,
              borderRadius: 100,
              borderWidth: 20,
              borderColor: '#F56040',
              opacity: 0.08,
            }}
          />

          {/* Main Large Graphic Badge */}
          <View style={{ position: 'relative', marginBottom: Spacing.lg }}>
            {/* Outer Glowing Ring */}
            <View
              style={{
                width: 104,
                height: 104,
                borderRadius: Radius.full,
                padding: 4,
                backgroundColor: '#E1306C',
                // Soft shadow behind icon badge
                shadowColor: '#E1306C',
                shadowOffset: { width: 0, height: 6 },
                shadowOpacity: 0.35,
                shadowRadius: 12,
                elevation: 6,
              }}
            >
              {/* Inner Circle Container */}
              <View
                style={{
                  flex: 1,
                  borderRadius: Radius.full,
                  backgroundColor: theme.backgroundElement,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Camera size={48} color="#E1306C" strokeWidth={1.8} />
              </View>
            </View>

            {/* Floating Large Sparkle Badge */}
            <View
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 36,
                height: 36,
                borderRadius: Radius.full,
                backgroundColor: '#F77737',
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 3,
                borderColor: theme.backgroundElement,
              }}
            >
              <Sparkles size={18} color="#FFF" strokeWidth={2.2} />
            </View>
          </View>

          {/* Main Title */}
          <ThemedText
            variant="body"
            style={{
              fontWeight: '800',
              fontSize: 20,
              color: theme.text,
              textAlign: 'center',
            }}
          >
            Share Your First Moment
          </ThemedText>

          {/* Subtext */}
          <ThemedText
            variant="caption"
            style={{
              color: theme.textSecondary,
              marginTop: Spacing.xs,
              textAlign: 'center',
              maxWidth: 270,
              lineHeight: 20,
              fontSize: 13,
            }}
          >
            Your feed is empty right now. Tap the plus icon below to post a photo or record a match!
          </ThemedText>
        </View>
      );
    }
    return null;
  }, [combinedFeed, postsLoading, loadingMorePosts, loadingMoreMatches, hasMorePosts, hasMoreMatches]);

  // Auto-open match detail when navigating from a notification tap
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    (async () => {
      try {
        const m = await fetchCommunityMatchById(matchId, user?.id);
        if (!cancelled && m) {
          setSelectedMatch(toMatchWithProfiles(m));
          setMatchPopupVisible(true);
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

  // Auto-open post detail when navigating from a notification tap
  useEffect(() => {
    if (!postId) return;
    let cancelled = false;
    (async () => {
      try {
        const { fetchCommunityPostById } = await import('@/services/communities');
        const p = await fetchCommunityPostById(postId, user?.id);
        if (!cancelled && p) {
          setSelectedPost(p);
          setPostPopupVisible(true);
        }
      } catch (e) {
        console.error('Failed to open deep-linked post:', e);
      } finally {
        if (!cancelled) router.setParams({ postId: undefined });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [postId, user?.id]);

  // Ping functionality (inline from FAB menu)
  const openPing = useCallback(async () => {
    if (!id || !user) return;
    setShowPingModal(true);
    setNowTs(Date.now());
    try {
      const until = await getNextPingTime(id, user.id);
      setPingCooldownUntil(until);
    } catch {
      setPingCooldownUntil(null);
    }
  }, [id, user, setNowTs, setPingCooldownUntil]);

  useEffect(() => {
    if (!pingCooldownUntil) return;
    const interval = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pingCooldownUntil, nowTs]);

  const cooldownRemainingMs = pingCooldownUntil
    ? Math.max(0, pingCooldownUntil.getTime() - nowTs)
    : 0;
  const inCooldown = cooldownRemainingMs > 0;

  const formatCooldown = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) return `${seconds}s`;
    return `${minutes}m ${seconds}s`;
  };

  const handleSendPing = async () => {
    if (!id || !user || !pingMessage.trim()) return;
    setSendingPing(true);
    try {
      await sendPing(id, user.id, pingMessage.trim());
      setPingMessage('');
      setShowPingModal(false);
      alert('Ping Sent', 'Notification sent to all members.');
    } catch (e: any) {
      alert('Error', e?.message ?? 'Failed to send ping.');
    } finally {
      setSendingPing(false);
    }
  };

  // Community chat
  const [chatVisible, setChatVisible] = useState(false);

  const handleJoin = async () => {
    if (!id || !user) return;
    try {
      if (community?.visibility === 'restricted') {
        await requestToJoinCommunity(id, user.id);
        alert('Request Sent', 'The admin will review your request.');
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
      alert('Error', e?.message ?? 'Failed to join.');
    }
  };

  const handleCreatePostClose = () => {
    setCreatePostModalVisible(false);
  };

  const handlePostPress = (post: CommunityPost) => {
    setSelectedPost(post);
    setPostPopupVisible(true);
  };

  const handleMatchPress = (match: MatchWithProfiles) => {
    setSelectedMatch(match);
    setMatchPopupVisible(true);
  };

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
    headerTitleStyle: { color: theme.text },
    headerLeft: () => (
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [
          { marginRight: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
                <Pressable onPress={() => router.navigate(`/community/${id}/info`)} hitSlop={12} style={({ pressed }) => [styles.headerIcon, pressed && { opacity: 0.6 }]}>
                  <MoreHorizontal size={22} color={theme.text} strokeWidth={2} />
                </Pressable>
              </View>
            ) : null,
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const threshold = contentSize.height - layoutMeasurement.height * 1.3;
          if (contentOffset.y >= threshold) {
            if (!loadingMorePosts && hasMorePosts) loadMorePosts();
            if (!loadingMoreMatches && hasMoreMatches) loadMatches(matchesPage + 1, true);
          }
        }}
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
                      backgroundColor: community.visibility === 'public' ? `${theme.success}20` : `${theme.warning}20`,
                    },
                  ]}
                >
                  {community.visibility === 'public' ? (
                    <Globe size={12} color={theme.success} strokeWidth={2.5} />
                  ) : (
                    <Lock size={12} color={theme.warning} strokeWidth={2.5} />
                  )}
                  <ThemedText
                    variant="caption"
                    style={{
                      color: community.visibility === 'public' ? theme.success : theme.warning,
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
                <View style={[styles.requestCountBadge, { backgroundColor: theme.error }]}>
                  <ThemedText style={styles.requestCountText}>
                    {joinRequests.length > 99 ? '99+' : joinRequests.length}
                  </ThemedText>
                </View>
              )}
              <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
            </View>
          </Pressable>
        )}

        {/* Pending Matches Banner - sleek banner at top, only when there are pending matches */}
        {isMember && allPendingMatches.length > 0 && (
          <Pressable
            onPress={() => router.navigate(`/community/${id}/pending-matches`)}
            style={{
              marginTop: Spacing.md,
              marginBottom: Spacing.xs,
              paddingHorizontal: Spacing.md,
              paddingVertical: Spacing.md,
              borderRadius: Radius.md,
              backgroundColor: `${theme.warning}15`,
              borderWidth: 1,
              borderColor: `${theme.warning}40`,
            }}
            hitSlop={8}
          >
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: Spacing.md,
            }}>
              <View style={{
                width: 28,
                height: 28,
                borderRadius: Radius.full,
                backgroundColor: `${theme.warning}25`,
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Clock size={16} color={theme.warning} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <ThemedText variant="label" style={{ fontWeight: '600' }}>
                  {allPendingMatches.length} pending match{allPendingMatches.length !== 1 ? 'es' : ''}
                </ThemedText>
                <ThemedText variant="caption" muted>
                  Tap to review
                </ThemedText>
              </View>
              <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
            </View>
          </Pressable>
        )}

        {/* 4. Feed Section (Members only) */}
        {isMember && (
          <View style={styles.section}>
            {/* Feed Header */}
            <View style={styles.feedHeader}>
              <View style={styles.feedHeaderLeft} />
              <View style={styles.feedHeaderRight} />
            </View>

            {/* Feed Content */}
            {feedContent}
          </View>
        )}

      </ScrollView>

      <FABMenu
        isMember={isMember}
        communityId={id}
        userId={user?.id}
        communitySport={community?.sport}
        inCooldown={inCooldown}
        cooldownRemainingMs={cooldownRemainingMs}
        formatCooldown={formatCooldown}
        openPing={openPing}
        setCreatePostInitialTab={setCreatePostInitialTab}
        setCreatePostModalVisible={setCreatePostModalVisible}
        router={router}
        onFabMenuClose={() => { }}
      />

      {/* Ping Input Modal (shown when Ping selected from FAB) */}
      {showPingModal && (
        <Modal
          transparent
          visible={true}
          animationType="fade"
          onRequestClose={() => { setShowPingModal(false); setPingMessage(''); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={0}
            style={styles.pingModalKeyboardAvoiding}
          >
            <Pressable style={styles.pingModalBackdrop} onPress={() => { setShowPingModal(false); setPingMessage(''); }}>
              <Pressable style={[styles.pingModalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={styles.pingModalHeader}>
                  <ThemedText variant="heading">Ping Everyone</ThemedText>
                  <Pressable onPress={() => { setShowPingModal(false); setPingMessage(''); }} hitSlop={16} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <X size={18} color={theme.text} strokeWidth={2.5} />
                  </Pressable>
                </View>
                <TextInput
                  placeholder="What's up? (e.g. Playing tennis now!)"
                  placeholderTextColor={theme.textSecondary}
                  value={pingMessage}
                  onChangeText={setPingMessage}
                  style={[
                    styles.pingModalInput,
                    {
                      color: theme.text,
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.border,
                    },
                  ]}
                  multiline
                  maxLength={200}
                  autoFocus
                />
                {inCooldown ? (
                  <View style={[styles.pingCooldownBox, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                    <Clock size={16} color={theme.textSecondary} strokeWidth={2} />
                    <ThemedText variant="caption" muted style={{ flex: 1 }}>
                      You can ping again in{' '}
                      <ThemedText variant="caption" style={{ fontWeight: '700', color: theme.text }}>
                        {formatCooldown(cooldownRemainingMs)}
                      </ThemedText>
                      .
                    </ThemedText>
                  </View>
                ) : (
                  <View style={styles.pingModalActions}>
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onPress={() => { setShowPingModal(false); setPingMessage(''); }}
                      buttonStyle={{ flex: 1 }}
                    />
                    <Button
                      label="Send Ping"
                      onPress={handleSendPing}
                      loading={sendingPing}
                      disabled={!pingMessage.trim()}
                      buttonStyle={{ flex: 1 }}
                    />
                  </View>
                )}
              </Pressable>
            </Pressable>
          </KeyboardAvoidingView>
        </Modal>
      )}

      <MatchDetailPopup
        match={selectedMatch}
        visible={matchPopupVisible}
        onClose={() => { setMatchPopupVisible(false); setSelectedMatch(null); }}
        currentUserId={user?.id}
        onRefreshFeed={loadMatches}
        communityId={id}
      />

      <PostDetailPopup
        post={selectedPost}
        visible={postPopupVisible}
        onClose={() => { setPostPopupVisible(false); setSelectedPost(null); }}
        currentUserId={user?.id}
        communityId={id}
        onRefreshFeed={refreshPosts}
      />

      <CreatePostModal
        communityId={id ?? ''}
        communitySport={community?.sport ?? ''}
        authorId={user?.id ?? ''}
        visible={createPostModalVisible}
        onClose={handleCreatePostClose}
        onRefreshFeed={refreshPosts}
        initialTab={createPostInitialTab}
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

  // Feed Section
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  feedHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  feedHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
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
  fabButton: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  pendingBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
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
  feedItem: {
    marginBottom: Spacing.xs,
  },
  pressedFeedItem: {
    opacity: 0.95,
  },
  loadMoreContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
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
  pingInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  pingCooldownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
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
  },

  // Ping Modal Styles (inline from FAB)
  pingModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  pingModalKeyboardAvoiding: {
    flex: 1,
  },
  pingModalContent: {
    width: '100%',
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  pingModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pingModalInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  pingModalActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
});