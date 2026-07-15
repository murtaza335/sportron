import { Calendar, Globe, Heart, Lock, Trophy, User, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
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

import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { addComment, fetchComments, toggleLike } from '@/services/matches';
import type { MatchComment, MatchWithProfiles } from '@/types';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type MatchDetailPopupProps = {
  match: MatchWithProfiles | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  onRefreshFeed?: () => void;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' at ' + date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function MatchDetailPopup({
  match,
  visible,
  onClose,
  currentUserId,
  onRefreshFeed,
}: MatchDetailPopupProps) {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  // Comments state
  const [comments, setComments] = useState<MatchComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);

  // Sync likes and load comments when match changes or modal opens
  useEffect(() => {
    if (visible && match) {
      setLiked(match.is_liked_by_user);
      setLikesCount(match.likes_count);
      
      const loadComments = async () => {
        setLoadingComments(true);
        try {
          const data = await fetchComments(match.id);
          setComments(data);
        } catch (error) {
          console.error('Failed to load comments:', error);
        } finally {
          setLoadingComments(false);
        }
      };
      
      loadComments();
    }
  }, [visible, match]);

  // Gesture responder for dragging the bottom sheet down to dismiss (attached only to handle/header)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 8;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
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
    })
  ).current;

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

  if (!match) {
    return null;
  }

  // Determine Teams
  const p1 = match.player?.id === currentUserId ? 'You' : (match.player?.display_name ?? 'Player A1');
  const p2 = match.playerPartner?.id === currentUserId ? 'You' : match.playerPartner?.display_name;
  const teamANames = [p1, p2].filter(Boolean);

  const op1 = match.opponent?.id === currentUserId ? 'You' : (match.opponent?.display_name ?? 'Player B1');
  const op2 = match.opponentPartner?.id === currentUserId ? 'You' : match.opponentPartner?.display_name;
  const teamBNames = [op1, op2].filter(Boolean);

  const isPlayerTeamWinner = match.player_score > match.opponent_score;
  const isOpponentTeamWinner = match.opponent_score > match.player_score;
  const isDraw = match.player_score === match.opponent_score;

  // Determine if current user won
  const isUserInPlayerTeam = currentUserId && (currentUserId === match.player_id || currentUserId === match.player_partner_id);
  const isUserInOpponentTeam = currentUserId && (currentUserId === match.opponent_id || currentUserId === match.opponent_partner_id);

  let userResult: 'win' | 'loss' | 'draw' | null = null;
  if (currentUserId && (isUserInPlayerTeam || isUserInOpponentTeam)) {
    if (isDraw) {
      userResult = 'draw';
    } else if (isUserInPlayerTeam) {
      userResult = isPlayerTeamWinner ? 'win' : 'loss';
    } else {
      userResult = isOpponentTeamWinner ? 'win' : 'loss';
    }
  }

  const getCreatorName = () => {
    if (match.player?.id === match.created_by) return match.player.display_name;
    if (match.playerPartner?.id === match.created_by) return match.playerPartner.display_name;
    if (match.opponent?.id === match.created_by) return match.opponent.display_name;
    if (match.opponentPartner?.id === match.created_by) return match.opponentPartner.display_name;
    return 'Unknown Player';
  };

  const handleLike = async () => {
    if (!currentUserId || !match) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    // Optimistically update properties in memory on the match object
    match.is_liked_by_user = nextLiked;
    match.likes_count = nextLiked ? match.likes_count + 1 : Math.max(0, match.likes_count - 1);

    try {
      await toggleLike(match.id, currentUserId, nextLiked);
      onRefreshFeed?.();
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert state
      setLiked(!nextLiked);
      setLikesCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
      match.is_liked_by_user = !nextLiked;
      match.likes_count = !nextLiked ? match.likes_count + 1 : Math.max(0, match.likes_count - 1);
    }
  };

  const handleSendComment = async () => {
    if (!newCommentText.trim() || !currentUserId || !match) return;
    setSubmittingComment(true);
    try {
      const added = await addComment(match.id, currentUserId, newCommentText);
      setComments((prev) => [...prev, added]);
      setNewCommentText('');
      
      // Update comments count on match object in memory
      match.comments_count = (match.comments_count || 0) + 1;
      onRefreshFeed?.();
    } catch (error) {
      console.error('Failed to add comment:', error);
    } finally {
      setSubmittingComment(false);
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                transform: [{ translateY }],
              },
            ]}
          >
            {/* Pull-down drag indicator */}
            <View style={styles.handleContainer} {...panResponder.panHandlers}>
              <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>

            {/* Header Row */}
            <View style={styles.header} {...panResponder.panHandlers}>
              <View style={styles.headerTitle}>
                <ThemedText variant="label" muted style={styles.formatLabel}>
                  {match.match_format} match
                </ThemedText>
                <View style={styles.visibilityRow}>
                  {match.is_public ? (
                    <Globe size={14} color={theme.textSecondary} />
                  ) : (
                    <Lock size={14} color={theme.textSecondary} />
                  )}
                  <ThemedText variant="caption" muted style={styles.visibilityText}>
                    {match.is_public ? 'Public' : 'Private'}
                  </ThemedText>
                </View>
              </View>
              <Pressable onPress={onClose} hitSlop={16} style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}>
                <X size={18} color={theme.text} strokeWidth={2.5} />
              </Pressable>
            </View>

            {/* Scrollable Details & Comments */}
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Main Scoreboard Section */}
              <View style={[styles.scoreboard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                {/* Team A */}
                <View style={styles.teamCol}>
                  <View style={[styles.avatarGroup, isPlayerTeamWinner && styles.winnerAvatarGroup]}>
                    <View style={[styles.avatar, { backgroundColor: theme.text }]}>
                      <ThemedText style={[styles.avatarText, { color: theme.background }]}>
                        {getInitials(match.player?.display_name ?? 'P1')}
                      </ThemedText>
                    </View>
                    {match.playerPartner ? (
                      <View style={[styles.avatar, styles.avatarOverlap, { backgroundColor: theme.textSecondary }]}>
                        <ThemedText style={[styles.avatarText, { color: theme.background }]}>
                          {getInitials(match.playerPartner.display_name)}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>
                  
                  <View style={styles.namesContainer}>
                    {teamANames.map((name, i) => (
                      <ThemedText key={i} variant="caption" style={[styles.playerName, isPlayerTeamWinner && styles.boldText]}>
                        {name}
                      </ThemedText>
                    ))}
                  </View>
                </View>

                {/* Score */}
                <View style={styles.scoreCol}>
                  <ThemedText style={styles.scoreText}>
                    {match.player_score} – {match.opponent_score}
                  </ThemedText>
                  
                  {/* Winner badge */}
                  {isDraw ? (
                    <View style={[styles.resultBadge, { backgroundColor: theme.border }]}>
                      <ThemedText variant="caption" style={styles.resultBadgeText}>Draw</ThemedText>
                    </View>
                  ) : (
                    <View style={[
                      styles.resultBadge, 
                      isPlayerTeamWinner 
                        ? { backgroundColor: '#10B98120' } 
                        : { backgroundColor: '#EF444420' } 
                    ]}>
                      <Trophy size={12} color={isPlayerTeamWinner ? '#10B981' : '#EF4444'} style={styles.trophyIcon} />
                      <ThemedText 
                        variant="caption" 
                        style={[
                          styles.resultBadgeText,
                          { color: isPlayerTeamWinner ? '#10B981' : '#EF4444', fontWeight: '800' }
                        ]}
                      >
                        {isPlayerTeamWinner ? 'Team A' : 'Team B'}
                      </ThemedText>
                    </View>
                  )}
                </View>

                {/* Team B */}
                <View style={styles.teamCol}>
                  <View style={[styles.avatarGroup, isOpponentTeamWinner && styles.winnerAvatarGroup]}>
                    <View style={[styles.avatar, { backgroundColor: theme.text }]}>
                      <ThemedText style={[styles.avatarText, { color: theme.background }]}>
                        {getInitials(match.opponent?.display_name ?? 'P2')}
                      </ThemedText>
                    </View>
                    {match.opponentPartner ? (
                      <View style={[styles.avatar, styles.avatarOverlap, { backgroundColor: theme.textSecondary }]}>
                        <ThemedText style={[styles.avatarText, { color: theme.background }]}>
                          {getInitials(match.opponentPartner.display_name)}
                        </ThemedText>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.namesContainer}>
                    {teamBNames.map((name, i) => (
                      <ThemedText key={i} variant="caption" style={[styles.playerName, isOpponentTeamWinner && styles.boldText]}>
                        {name}
                      </ThemedText>
                    ))}
                  </View>
                </View>
              </View>

              {/* Personal result banner if user was a participant */}
              {userResult && (
                <View style={[
                  styles.userBanner,
                  userResult === 'win' && { backgroundColor: '#10B98115', borderColor: '#10B98130' },
                  userResult === 'loss' && { backgroundColor: '#EF444415', borderColor: '#EF444430' },
                  userResult === 'draw' && { backgroundColor: '#6B728015', borderColor: '#6B728030' },
                ]}>
                  <ThemedText 
                    variant="body" 
                    style={[
                      styles.userBannerText, 
                      userResult === 'win' && { color: '#10B981' },
                      userResult === 'loss' && { color: '#EF4444' },
                      userResult === 'draw' && { color: '#6B7280' },
                    ]}
                  >
                    {userResult === 'win' ? '🎉 You won this match!' : userResult === 'loss' ? '😔 You lost this match' : '🤝 Match ended in a draw'}
                  </ThemedText>
                </View>
              )}

              {/* Details list */}
              <View style={styles.detailsList}>
                <View style={styles.detailItem}>
                  <Calendar size={16} color={theme.textSecondary} />
                  <View style={styles.detailContent}>
                    <ThemedText variant="caption" muted>Played on</ThemedText>
                    <ThemedText variant="body" style={styles.detailValue}>
                      {formatDate(match.created_at)}
                    </ThemedText>
                  </View>
                </View>

                <Divider spacing={Spacing.sm} />

                <View style={styles.detailItem}>
                  <User size={16} color={theme.textSecondary} />
                  <View style={styles.detailContent}>
                    <ThemedText variant="caption" muted>Recorded by</ThemedText>
                    <ThemedText variant="body" style={styles.detailValue}>
                      {getCreatorName()}
                    </ThemedText>
                  </View>
                </View>
              </View>

              <Divider spacing={Spacing.sm} />

              {/* Social Header (Likes Count and Comments Header) */}
              <View style={styles.sectionHeader}>
                <ThemedText variant="label" style={styles.sectionTitle}>
                  Comments ({comments.length})
                </ThemedText>
                <Pressable onPress={handleLike} style={styles.likeActionBtn} hitSlop={8}>
                  <Heart 
                    size={16} 
                    color={liked ? '#EF4444' : theme.textSecondary} 
                    fill={liked ? '#EF4444' : 'none'} 
                  />
                  <ThemedText variant="caption" style={[styles.likeText, { color: liked ? '#EF4444' : theme.textSecondary }]}>
                    {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                  </ThemedText>
                </Pressable>
              </View>

              {/* Comments List */}
              {loadingComments ? (
                <ActivityIndicator color={theme.text} style={styles.loader} />
              ) : comments.length === 0 ? (
                <ThemedText variant="caption" muted style={styles.emptyComments}>
                  No comments yet. Be the first to comment!
                </ThemedText>
              ) : (
                <View style={styles.commentsContainer}>
                  {comments.map((comment) => (
                    <View key={comment.id} style={styles.commentRow}>
                      <View style={[styles.commentAvatar, { backgroundColor: theme.textSecondary }]}>
                        <ThemedText style={[styles.avatarText, { fontSize: 10, color: theme.background }]}>
                          {getInitials(comment.profile?.display_name ?? '?')}
                        </ThemedText>
                      </View>
                      <View style={[styles.commentBody, { backgroundColor: theme.backgroundElement }]}>
                        <View style={styles.commentMeta}>
                          <ThemedText variant="caption" style={styles.commentAuthor}>
                            {comment.profile?.display_name ?? 'Player'}
                          </ThemedText>
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

            {/* Sticky Comment Form at the bottom of the Sheet */}
            {currentUserId && (
              <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  value={newCommentText}
                  onChangeText={setNewCommentText}
                  placeholder="Write a comment..."
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
                  <ThemedText style={{ color: theme.text, fontWeight: '700' }}>
                    {submittingComment ? 'Sending...' : 'Send'}
                  </ThemedText>
                </Pressable>
              </View>
            )}

            <Button label="Close" onPress={onClose} style={styles.closeAction} />
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
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg + 10,
    maxHeight: '85%',
  },
  handleContainer: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  headerTitle: {
    gap: Spacing.xs,
  },
  formatLabel: {
    textTransform: 'uppercase',
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  visibilityText: {
    fontWeight: '500',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    maxHeight: SCREEN_HEIGHT * 0.46,
    marginBottom: Spacing.sm,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
  },
  scoreboard: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  teamCol: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerAvatarGroup: {
    transform: [{ scale: 1.05 }],
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#00000000',
  },
  avatarOverlap: {
    marginLeft: -12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  namesContainer: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  playerName: {
    fontWeight: '500',
    textAlign: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
  scoreCol: {
    width: 100,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  scoreText: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs - 2,
    borderRadius: Radius.full,
  },
  resultBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  trophyIcon: {
    marginRight: 4,
  },
  userBanner: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  userBannerText: {
    fontWeight: '700',
    fontSize: 14,
  },
  detailsList: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  detailContent: {
    flex: 1,
    gap: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.md,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  likeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  likeText: {
    fontWeight: '700',
  },
  commentsContainer: {
    gap: Spacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  commentBody: {
    flex: 1,
    padding: Spacing.sm - 2,
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
    fontSize: 12,
  },
  commentTime: {
    fontSize: 10,
  },
  commentContent: {
    fontSize: 14,
    lineHeight: 18,
  },
  emptyComments: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  loader: {
    paddingVertical: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: Spacing.xs,
  },
  sendButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  pressedBtn: {
    opacity: 0.7,
  },
  closeAction: {
    marginTop: Spacing.xs,
  },
});
