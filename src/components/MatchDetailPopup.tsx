import { AlertTriangle, Calendar, Check, Clock, Globe, Heart, Lock, User, X } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { alert } from '@/lib/alert';
import { Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import {
  addCommunityMatchComment,
  approveCommunityMatch,
  disputeCommunityMatch,
  fetchCommunityMatchComments,
  toggleCommunityMatchLike,
} from '@/services/communities';
import type { CommunityMatchComment, MatchWithProfiles, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type MatchDetailPopupProps = {
  match: MatchWithProfiles | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  onRefreshFeed?: () => void;
  recordedByName?: string;
  communityId?: string;
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }) +
    ' · ' +
    date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

export function MatchDetailPopup({
  match,
  visible,
  onClose,
  currentUserId,
  onRefreshFeed,
  recordedByName,
  communityId,
}: MatchDetailPopupProps) {
  const theme = useTheme();
  const router = useRouter();
  const [translateY] = useState(() => new Animated.Value(SCREEN_HEIGHT));

  const [comments, setComments] = useState<CommunityMatchComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [liking, setLiking] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<'pending' | 'verified' | 'disputed'>('pending');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const panResponder = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const [panHandlers, setPanHandlers] = useState<ReturnType<typeof PanResponder.create>['panHandlers'] | null>(null);

  useEffect(() => {
    if (!panResponder.current) {
      panResponder.current = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 8,
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 120 || gestureState.vy > 0.4) {
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 220,
              useNativeDriver: true,
            }).start(onClose);
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              tension: 50,
              friction: 8,
              useNativeDriver: true,
            }).start();
          }
        },
      });
      setPanHandlers(panResponder.current.panHandlers);
    }
  }, [translateY, onClose]);

  useEffect(() => {
    if (visible && match) {
      setTimeout(() => {
        setLiked(match.is_liked_by_user);
        setLikesCount(match.likes_count);
        setNewCommentText('');
        setVerificationStatus(match.verification_status);
      }, 0);

      const loadComments = async () => {
        setLoadingComments(true);
        try {
          const data = await fetchCommunityMatchComments(match.id);
          setComments(data);
        } catch (error) {
          console.error('Failed to load comments:', error);
        } finally {
          setLoadingComments(false);
        }
      };
      loadComments();
    } else {
      setTimeout(() => {
        setComments([]);
        setNewCommentText('');
      }, 0);
    }
  }, [visible, match]);

  // Realtime: listen for likes changes on this match
  useEffect(() => {
    if (!visible || !match) return;

    const channel = supabase
      .channel(`match-likes-${match.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_match_likes',
          filter: `community_match_id=eq.${match.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLikesCount((prev) => prev + 1);
            if (payload.new.profile_id === currentUserId) setLiked(true);
          } else if (payload.eventType === 'DELETE') {
            setLikesCount((prev) => Math.max(0, prev - 1));
            if (payload.old.profile_id === currentUserId) setLiked(false);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, match, currentUserId]);

  // Realtime: listen for comments changes on this match
  useEffect(() => {
    if (!visible || !match) return;

    const channel = supabase
      .channel(`match-comments-${match.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_match_comments',
          filter: `community_match_id=eq.${match.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newComment = payload.new as CommunityMatchComment;
            // Avoid duplicate if we just added it optimistically
            setComments((prev) =>
              prev.some((c) => c.id === newComment.id) ? prev : [...prev, newComment],
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setComments((prev) => prev.filter((c) => c.id !== deletedId));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [visible, match]);

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(SCREEN_HEIGHT);
    }
  }, [visible, translateY]);

  if (!match) return null;

  // Player Names
  const p1 = match.player?.id === currentUserId ? 'You' : match.player?.username ?? 'Player A';
  const p2 = match.playerPartner?.id === currentUserId ? 'You' : match.playerPartner?.username;
  const teamAName = [p1, p2].filter(Boolean).join(' + ');

  const op1 = match.opponent?.id === currentUserId ? 'You' : match.opponent?.username;
  const op2 = match.opponentPartner?.id === currentUserId ? 'You' : match.opponentPartner?.username;
  const teamBName = [op1, op2].filter(Boolean).join(' + ') || (match.opponent_guest_name ?? 'Guest');

  const playerWon = match.player_score > match.opponent_score;
  const opponentWon = match.opponent_score > match.player_score;
  const isDraw = match.player_score === match.opponent_score;

  const isUserInPlayerTeam = currentUserId && (currentUserId === match.player_id || currentUserId === match.player_partner_id);
  const isUserInOpponentTeam = currentUserId && (currentUserId === match.opponent_id || currentUserId === match.opponent_partner_id);
  const isOpponent = isUserInOpponentTeam;

  let userResult: 'win' | 'loss' | 'draw' | null = null;
  if (currentUserId && (isUserInPlayerTeam || isUserInOpponentTeam)) {
    if (isDraw) userResult = 'draw';
    else if (isUserInPlayerTeam) userResult = playerWon ? 'win' : 'loss';
    else userResult = opponentWon ? 'win' : 'loss';
  }

  const creatorName = recordedByName ?? match.recorder?.username ?? match.player?.username ?? 'Unknown';

  const handleLike = async () => {
    if (!currentUserId || liking) return;
    setLiking(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      await toggleCommunityMatchLike(match.id, currentUserId, nextLiked);
      onRefreshFeed?.();
    } catch (error) {
      console.error('Failed to toggle like:', error);
      setLiked(!nextLiked);
      setLikesCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    } finally {
      setLiking(false);
    }
  };

  const handleSendComment = async () => {
    if (!newCommentText.trim() || !currentUserId) return;
    setSubmittingComment(true);
    try {
      const added = await addCommunityMatchComment(match.id, currentUserId, newCommentText);
      setComments((prev) => [...prev, added]);
      setNewCommentText('');
      onRefreshFeed?.();
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleVerifyStatus = async (status: 'verified' | 'disputed') => {
    if (!currentUserId) return;
    setUpdatingStatus(true);
    try {
      if (status === 'verified') await approveCommunityMatch(match.id, currentUserId);
      else await disputeCommunityMatch(match.id, currentUserId);
      setVerificationStatus(status);
      onRefreshFeed?.();
    } catch {
      alert('Error', 'Failed to update verification status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const statusStyle = {
    verified: { bg: `${theme.success}1F`, color: theme.success, label: 'Verified', Icon: Check },
    pending: { bg: `${theme.warning}1F`, color: theme.warning, label: 'Pending', Icon: Clock },
    disputed: { bg: `${theme.error}1F`, color: theme.error, label: 'Disputed', Icon: AlertTriangle },
  }[verificationStatus];

  const StatusIcon = statusStyle.Icon;

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <Animated.View
            style={[
              styles.sheet,
              { backgroundColor: theme.backgroundElement, transform: [{ translateY }] },
            ]}
          >
            {/* Handle Bar */}
            <View style={styles.handleContainer} {...panHandlers}>
              <View style={[styles.handle, { backgroundColor: theme.textSecondary, opacity: 0.3 }]} />
            </View>

            {/* Modal Header */}
            <View style={styles.header}>
              <View style={styles.headerInfo}>
                <ThemedText variant="body" style={styles.headerTitle}>
                  {SPORT_LABELS[match.sport as Sport] || match.custom_sport_name || match.sport} · {match.player_partner_id || match.opponent_partner_id ? 'Doubles' : 'Singles'}
                </ThemedText>
                <View style={styles.visibilityRow}>
                  {match.is_public ? <Globe size={12} color={theme.textSecondary} /> : <Lock size={12} color={theme.textSecondary} />}
                  <ThemedText variant="caption" muted style={styles.visibilityText}>
                    {match.is_public ? 'Public Match' : 'Private Match'}
                  </ThemedText>
                </View>
              </View>

              <Pressable onPress={onClose} hitSlop={8} style={[styles.closeBtn, { backgroundColor: theme.background }]}>
                <X size={16} color={theme.text} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Matchup Container */}
              <View style={[styles.matchupContainer, { backgroundColor: theme.background }]}>
                <View style={styles.teamLeft}>
                  <View style={styles.avatarGroup}>
                    <Pressable disabled={!match.player?.id} onPress={() => { if (match.player?.id) router.push(`/profile/${match.player.id}${communityId ? `?community=${communityId}` : ''}`); }}>
                      <UserAvatar avatarUrl={match.player?.avatar_url} size={32} />
                    </Pressable>
                    {match.playerPartner && (
                      <Pressable disabled={!match.playerPartner.id} onPress={() => { if (match.playerPartner?.id) router.push(`/profile/${match.playerPartner.id}${communityId ? `?community=${communityId}` : ''}`); }} style={styles.avatarOverlap}>
                        <UserAvatar avatarUrl={match.playerPartner.avatar_url} size={32} />
                      </Pressable>
                    )}
                  </View>
                  <ThemedText variant="body" numberOfLines={2} style={[styles.teamName, playerWon && styles.winningTeamName]}>
                    {teamAName}
                  </ThemedText>
                </View>

                <View style={styles.scoreCenter}>
                  <ThemedText style={styles.scoreText}>
                    {match.player_score} – {match.opponent_score}
                  </ThemedText>
                  {userResult && (
                    <View style={[
                      styles.resultBadge,
                      { backgroundColor: userResult === 'win' ? `${theme.success}1F` : userResult === 'loss' ? `${theme.error}1F` : `${theme.textSecondary}1F` }
                    ]}>
                      <ThemedText style={[
                        styles.resultText,
                        { color: userResult === 'win' ? theme.success : userResult === 'loss' ? theme.error : theme.textSecondary }
                      ]}>
                        {userResult}
                      </ThemedText>
                    </View>
                  )}
                </View>

                <View style={styles.teamRight}>
                  <View style={styles.avatarGroup}>
                    <Pressable disabled={!match.opponent?.id} onPress={() => { if (match.opponent?.id) router.push(`/profile/${match.opponent.id}${communityId ? `?community=${communityId}` : ''}`); }}>
                      <UserAvatar avatarUrl={match.opponent?.avatar_url} size={32} />
                    </Pressable>
                    {match.opponentPartner && (
                      <Pressable disabled={!match.opponentPartner.id} onPress={() => { if (match.opponentPartner?.id) router.push(`/profile/${match.opponentPartner.id}${communityId ? `?community=${communityId}` : ''}`); }} style={styles.avatarOverlap}>
                        <UserAvatar avatarUrl={match.opponentPartner.avatar_url} size={32} />
                      </Pressable>
                    )}
                  </View>
                  <ThemedText variant="body" numberOfLines={2} style={[styles.teamName, opponentWon && styles.winningTeamName, styles.alignRight]}>
                    {teamBName}
                  </ThemedText>
                </View>
              </View>

              {/* Opponent Verification Prompt */}
              {verificationStatus === 'pending' && isOpponent && (
                <View style={[styles.verifyCard, { backgroundColor: theme.background }]}>
                  <ThemedText variant="body" style={styles.verifyTitle}>Verify Match Result</ThemedText>
                  <ThemedText variant="caption" muted style={styles.verifySubtitle}>
                    Confirm if the score and teams recorded above are accurate.
                  </ThemedText>
                  <View style={styles.verifyActions}>
                    <Pressable
                      onPress={() => handleVerifyStatus('verified')}
                      disabled={updatingStatus}
                      style={[styles.verifyBtn, { backgroundColor: theme.text }]}
                    >
                      <ThemedText style={[styles.verifyBtnText, { color: theme.background }]}>Confirm</ThemedText>
                    </Pressable>
                    <Pressable
                      onPress={() => handleVerifyStatus('disputed')}
                      disabled={updatingStatus}
                      style={[styles.verifyBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.error }]}
                    >
                      <ThemedText style={[styles.verifyBtnText, { color: theme.error }]}>Dispute</ThemedText>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Match Details List */}
              <View style={styles.detailsList}>
                <View style={styles.detailItem}>
                  <Calendar size={15} color={theme.textSecondary} />
                  <ThemedText variant="caption" muted style={styles.detailLabel}>Played</ThemedText>
                  <ThemedText variant="body" style={styles.detailValue}>{formatDate(match.created_at)}</ThemedText>
                </View>

                <Divider spacing={Spacing.xs} />

                <Pressable
                  style={styles.detailItem}
                  disabled={!match.recorder?.id && !match.player?.id}
                  onPress={() => {
                    const creatorId = match.recorder?.id ?? match.player?.id;
                    if (creatorId) router.push(`/profile/${creatorId}${communityId ? `?community=${communityId}` : ''}`);
                  }}
                >
                  <User size={15} color={theme.textSecondary} />
                  <ThemedText variant="caption" muted style={styles.detailLabel}>Recorded by</ThemedText>
                  <ThemedText variant="body" style={styles.detailValue}>{creatorName}</ThemedText>
                </Pressable>

                <Divider spacing={Spacing.xs} />

                <View style={styles.detailItem}>
                  <StatusIcon size={15} color={statusStyle.color} />
                  <ThemedText variant="caption" muted style={styles.detailLabel}>Status</ThemedText>
                  <View style={[styles.badgePill, { backgroundColor: statusStyle.bg }]}>
                    <ThemedText variant="caption" style={[styles.badgeText, { color: statusStyle.color }]}>
                      {statusStyle.label}
                    </ThemedText>
                  </View>
                </View>
              </View>

              <Divider spacing={Spacing.sm} />

              {/* Social Action Header */}
              <View style={styles.sectionHeader}>
                <ThemedText variant="body" style={styles.sectionTitle}>
                  Comments ({comments.length})
                </ThemedText>
                <Pressable
                  onPress={handleLike}
                  disabled={liking}
                  style={({ pressed }) => [styles.likeActionBtn, pressed && { opacity: 0.6 }]}
                  hitSlop={8}
                >
                  <Heart size={15} color={liked ? theme.error : theme.textSecondary} fill={liked ? theme.error : 'none'} />
                  <ThemedText variant="caption" style={[styles.likeText, { color: liked ? theme.error : theme.textSecondary }]}>
                    {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                  </ThemedText>
                </Pressable>
              </View>

              {/* Comments List */}
              {loadingComments ? (
                <ActivityIndicator color={theme.text} style={styles.loader} />
              ) : comments.length === 0 ? (
                <ThemedText variant="caption" muted style={styles.emptyComments}>
                  No comments yet. Start the conversation!
                </ThemedText>
              ) : (
                <View style={styles.commentsContainer}>
{comments.map((comment) => (
                      <View key={comment.id} style={styles.commentRow}>
                        <Pressable
                          disabled={!comment.profile?.id}
                          onPress={() => {
                            if (comment.profile?.id) router.push(`/profile/${comment.profile.id}${communityId ? `?community=${communityId}` : ''}`);
                          }}
                        >
                          <UserAvatar avatarUrl={comment.profile?.avatar_url} size={28} />
                        </Pressable>
                        <View style={[styles.commentBody, { backgroundColor: theme.background }]}>
                          <View style={styles.commentMeta}>
                            <Pressable
                              disabled={!comment.profile?.id}
                              onPress={() => {
                                if (comment.profile?.id) router.push(`/profile/${comment.profile.id}${communityId ? `?community=${communityId}` : ''}`);
                              }}
                            >
                             <ThemedText variant="caption" style={styles.commentAuthor}>
                               {comment.profile?.username ?? 'Player'}
                             </ThemedText>
                           </Pressable>
                           <ThemedText variant="caption" muted style={styles.commentTime}>
                             {new Date(comment.created_at).toLocaleDateString()}
                           </ThemedText>
                         </View>
                         <ThemedText variant="body" style={styles.commentContent}>
                           {comment.content}
                         </ThemedText>
                       </View>
                     </View>
                   ))}
                </View>
              )}
            </ScrollView>

            {/* Bottom Sticky Comment Input */}
            {currentUserId && (
              <View style={[styles.inputRow, { backgroundColor: theme.background }]}>
                <TextInput
                  value={newCommentText}
                  onChangeText={setNewCommentText}
                  placeholder="Add a comment..."
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.commentInput, { color: theme.text }]}
                  editable={!submittingComment}
                />
                <Pressable
                  onPress={handleSendComment}
                  disabled={!newCommentText.trim() || submittingComment}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (!newCommentText.trim() || submittingComment) && styles.disabledBtn,
                    pressed && styles.pressedBtn,
                  ]}
                >
                  <ThemedText style={[styles.sendText, { color: theme.text }]}>
                    {submittingComment ? '...' : 'Post'}
                  </ThemedText>
                </Pressable>
              </View>
            )}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg + 10 : Spacing.md,
    maxHeight: '85%',
    gap: Spacing.xs,
  },
  handleContainer: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  handle: {
    width: 32,
    height: 4,
    borderRadius: Radius.full,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.xs,
  },
  headerInfo: {
    gap: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  visibilityText: {
    fontSize: 11,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexShrink: 1,
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  scrollContent: {
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  teamLeft: {
    flex: 1.2,
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  teamRight: {
    flex: 1.2,
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  avatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOverlap: {
    marginLeft: -10,
  },
  teamName: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  winningTeamName: {
    fontWeight: '800',
  },
  alignRight: {
    textAlign: 'right',
  },
  scoreCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 80,
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  resultBadge: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1.5,
    borderRadius: Radius.full,
  },
  resultText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  detailsList: {
    gap: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  detailLabel: {
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12.5,
    fontWeight: '600',
    marginLeft: 'auto',
  },
  badgePill: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.full,
    marginLeft: 'auto',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  likeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  commentsContainer: {
    gap: Spacing.xs,
  },
  commentRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    alignItems: 'flex-start',
  },
  commentBody: {
    flex: 1,
    padding: Spacing.xs + 2,
    borderRadius: Radius.md,
    gap: 2,
  },
  commentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  commentAuthor: {
    fontWeight: '700',
    fontSize: 11.5,
  },
  commentTime: {
    fontSize: 10,
  },
  commentContent: {
    fontSize: 13,
    lineHeight: 16,
  },
  emptyComments: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
    fontSize: 12,
  },
  loader: {
    paddingVertical: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    marginTop: Spacing.xs,
  },
  commentInput: {
    flex: 1,
    fontSize: 13,
    paddingVertical: Spacing.xs,
  },
  sendButton: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: Spacing.xs,
  },
  sendText: {
    fontSize: 13,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  pressedBtn: {
    opacity: 0.7,
  },
  verifyCard: {
    borderRadius: Radius.md,
    padding: Spacing.sm + 2,
    gap: 4,
    alignItems: 'center',
  },
  verifyTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  verifySubtitle: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  verifyActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  verifyBtn: {
    flex: 1,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disputeBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  verifyBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  disputeText: {
    color: '#DC2626',
  },
});