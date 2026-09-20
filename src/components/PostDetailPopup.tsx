import { useRouter } from 'expo-router';
import { Heart, MessageSquare, MoreHorizontal, Send, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/date';
import {
  addCommunityPostComment,
  deleteCommunityPost,
  fetchCommunityPostComments,
  toggleCommunityPostLike,
} from '@/services/communities';
import type { CommunityPost, CommunityPostComment } from '@/types';

type PostDetailPopupProps = {
  post: CommunityPost | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  communityId?: string;
  onRefreshFeed?: () => void;
};

const SWIPE_THRESHOLD = 100;

export function PostDetailPopup({
  post,
  visible,
  onClose,
  currentUserId,
  communityId,
  onRefreshFeed,
}: PostDetailPopupProps) {
  const theme = useTheme();
  const router = useRouter();

  const [comments, setComments] = useState<CommunityPostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [showMenu, setShowMenu] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const commentsSectionRef = useRef<View>(null);
  const inputWrapperRef = useRef<View>(null);
  const lastPostIdRef = useRef<string | null>(null);

  const translateY = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const dragStartY = useSharedValue(0);

  const isMine = currentUserId === post?.author_id;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const loadComments = useCallback(async () => {
    if (!post) return;
    setCommentsLoading(true);
    try {
      const data = await fetchCommunityPostComments(post.id);
      setComments(data);
    } catch (e) {
      console.error('Failed to load comments:', e);
    } finally {
      setCommentsLoading(false);
    }
  }, [post]);

  useEffect(() => {
    if (!visible || !post) return;
    if (lastPostIdRef.current === post.id) return;
    lastPostIdRef.current = post.id;

    setLiked(post.is_liked_by_user ?? false);
    setLikesCount(post.likes_count ?? 0);
    loadComments();
    translateY.value = 0;
  }, [visible, post, loadComments]);

  const animateClose = () => {
    translateY.value = withTiming(400, { duration: 200 }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  const animateOpen = () => {
    translateY.value = withSpring(0, { damping: 20, stiffness: 150 });
  };

  const scrollToComments = () => {
    if (commentsSectionRef.current) {
      commentsSectionRef.current.measure((_, __, ___, height) => {
        if (scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: height * 0.5, animated: true });
        }
      });
    }
    // Focus the input after a short delay to let scroll happen
    setTimeout(() => {
      if (inputWrapperRef.current) {
        // The input will focus via the keyboard avoiding view
      }
    }, 150);
  };

  const handlePanGesture = Gesture.Pan()
    .onBegin((e) => {
      isDragging.value = true;
      dragStartY.value = e.y;
    })
    .onUpdate((e) => {
      if (!isDragging.value) return;
      const translationY = e.translationY;
      if (translationY > 0) {
        translateY.value = translationY;
      }
    })
    .onEnd((e) => {
      isDragging.value = false;
      const velocityY = e.velocityY;
      const currentY = translateY.value;

      if (currentY > SWIPE_THRESHOLD || velocityY > 500) {
        animateClose();
      } else {
        animateOpen();
      }
    });

  const handleLike = async () => {
    if (!currentUserId || !post) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      await toggleCommunityPostLike(post.id, currentUserId, nextLiked);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      setLiked(!nextLiked);
      setLikesCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const handleSendComment = async () => {
    if (!currentUserId || !post || !commentText.trim() || sendingComment) return;
    setSendingComment(true);
    const content = commentText.trim();
    setCommentText('');

    try {
      const newComment = await addCommunityPostComment(post.id, currentUserId, content);
      setComments((prev) => [...prev, newComment]);
      Keyboard.dismiss();
    } catch (error) {
      console.error('Failed to add comment:', error);
      setCommentText(content);
      Alert.alert('Error', 'Failed to post comment');
    } finally {
      setSendingComment(false);
    }
  };

  const handleDelete = async () => {
    if (!currentUserId || !post) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCommunityPost(post.id, currentUserId);
            onClose();
            onRefreshFeed?.();
          } catch (error) {
            console.error('Failed to delete post:', error);
            Alert.alert('Error', 'Failed to delete post');
          }
        },
      },
    ]);
    setShowMenu(false);
  };

  const renderPostContent = useCallback(() => {
    if (!post) return null;

    if (post.post_type === 'photo' && post.image_url) {
      return (
        <View style={styles.photoContainer}>
          {!imageLoaded && !imageError && <View style={styles.imagePlaceholder} />}
          <Image
            source={{ uri: post.image_url }}
            style={styles.postImage}
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
            resizeMode="cover"
          />
          {imageError && (
            <View style={styles.imageError}>
              <ThemedText variant="caption" muted>Failed to load image</ThemedText>
            </View>
          )}
          {post.content && (
            <ThemedText variant="body" style={styles.textContent}>
              {post.content}
            </ThemedText>
          )}
        </View>
      );
    }

    if ((post.post_type === 'text' || post.post_type === 'photo') && post.content) {
      return (
        <ThemedText variant="body" style={styles.textContent}>
          {post.content}
        </ThemedText>
      );
    }

    if (post.post_type === 'match') {
      return (
        <View style={styles.matchIndicator}>
          <ThemedText variant="body" style={{ color: theme.accent, fontWeight: '600' }}>
            Match recorded
          </ThemedText>
        </View>
      );
    }

    return null;
  }, [post, imageLoaded, imageError, theme]);

  const renderCommentsSection = () => {
    if (commentsLoading) {
      return (
        <View style={styles.commentsLoading}>
          <ThemedText variant="caption" muted>Loading comments...</ThemedText>
        </View>
      );
    }
    if (comments.length > 0) {
      return comments.map((comment) => (
        <View key={comment.id} style={styles.comment}>
          <Pressable
            disabled={!comment.profile?.id}
            onPress={() => {
              if (comment.profile?.id) router.push(`/profile/${comment.profile.id}${communityId ? `?community=${communityId}` : ''}`);
            }}
            style={({ pressed }) => pressed && styles.pressedContent}
          >
            <UserAvatar avatarUrl={comment.profile?.avatar_url} size={32} />
          </Pressable>
          <View style={styles.commentContent}>
            <View style={styles.commentHeader}>
              <Pressable
                disabled={!comment.profile?.id}
                onPress={() => {
                  if (comment.profile?.id) router.push(`/profile/${comment.profile.id}${communityId ? `?community=${communityId}` : ''}`);
                }}
                style={({ pressed }) => pressed && styles.pressedContent}
              >
                <ThemedText variant="body" style={styles.commentAuthor} numberOfLines={1}>
                  {comment.profile?.username ?? 'Unknown'}
                </ThemedText>
              </Pressable>
              <ThemedText variant="caption" muted style={styles.commentTime}>
                {formatRelativeTime(comment.created_at)}
              </ThemedText>
            </View>
            <ThemedText variant="body" style={styles.commentText}>
              {comment.content}
            </ThemedText>
          </View>
        </View>
      ));
    }
    return (
      <View style={styles.noComments}>
        <ThemedText variant="caption" muted>No comments yet. Be the first to comment!</ThemedText>
      </View>
    );
  };

  if (!visible || !post) return null;

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.modalContainer, animatedStyle]}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View
          style={[
            styles.modalContent,
            { backgroundColor: theme.background, borderColor: theme.border },
          ]}
        >
          <GestureDetector gesture={handlePanGesture}>
            <View style={{ flex: 1 }}>
              <Pressable onPress={animateOpen} style={styles.dragHandleContainer} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />
              </Pressable>

              <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                <ThemedText variant="heading">Post</ThemedText>
                <View style={styles.headerRight}>
                  {isMine && (
                    <Pressable
                      onPress={() => setShowMenu(true)}
                      hitSlop={12}
                      style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
                    >
                      <MoreHorizontal size={20} color={theme.text} strokeWidth={2} />
                    </Pressable>
                  )}
                  <Pressable onPress={onClose} hitSlop={16} style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <X size={24} color={theme.text} strokeWidth={2.5} />
                  </Pressable>
                </View>
              </View>

              <ScrollView
              ref={scrollViewRef}
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Pressable
                    disabled={!post.author?.id}
                    onPress={() => {
                      if (post.author?.id) router.push(`/profile/${post.author.id}${communityId ? `?community=${communityId}` : ''}`);
                    }}
                    style={({ pressed }) => pressed && styles.pressedContent}
                  >
                    <UserAvatar avatarUrl={post.author?.avatar_url} size={40} />
                  </Pressable>
                  <View style={styles.postAuthorTextCol}>
                    <Pressable
                      disabled={!post.author?.id}
                      onPress={() => {
                        if (post.author?.id) router.push(`/profile/${post.author.id}${communityId ? `?community=${communityId}` : ''}`);
                      }}
                      style={({ pressed }) => pressed && styles.pressedContent}
                    >
                      <ThemedText variant="body" style={styles.postAuthorName} numberOfLines={1}>
                        {post.author?.username ?? 'Unknown'}
                      </ThemedText>
                    </Pressable>
                    <ThemedText variant="caption" muted style={styles.postTimeAgo}>
                      {formatRelativeTime(post.created_at)}
                    </ThemedText>
                  </View>
                </View>

                {renderPostContent()}

                <View style={styles.postSocialRow}>
                  <Pressable onPress={handleLike} hitSlop={8} style={({ pressed }) => [styles.socialAction, pressed && styles.pressedSocial]}>
                    <Heart size={20} color={liked ? theme.error : theme.textSecondary} fill={liked ? theme.error : 'none'} />
                    <ThemedText variant="label" style={[styles.socialText, { color: liked ? theme.error : theme.textSecondary }]}>
                      {likesCount} {likesCount === 1 ? 'like' : 'likes'}
                    </ThemedText>
                  </Pressable>

                  <Pressable onPress={scrollToComments} hitSlop={8} style={({ pressed }) => [styles.socialAction, pressed && styles.pressedSocial]}>
                    <MessageSquare size={20} color={theme.textSecondary} />
                    <ThemedText variant="label" muted style={styles.socialText}>
                      {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                    </ThemedText>
                  </Pressable>
                </View>
              </View>

              <View ref={commentsSectionRef} style={styles.commentsSection}>
                <ThemedText variant="heading" style={styles.commentsTitle}>
                  Comments ({comments.length})
                </ThemedText>

                {renderCommentsSection()}
              </View>
            </ScrollView>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={0}
              style={[styles.inputContainer, { borderTopColor: theme.border }]}
            >
              <View ref={inputWrapperRef} style={[styles.inputWrapper, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  placeholder="Write a comment..."
                  placeholderTextColor={theme.textSecondary}
                  value={commentText}
                  onChangeText={setCommentText}
                  style={[
                    styles.textInput,
                    { color: theme.text },
                  ]}
                  multiline
                  maxLength={1000}
                  onSubmitEditing={handleSendComment}
                  returnKeyType="send"
                  blurOnSubmit={false}
                />
                <Pressable
                  onPress={handleSendComment}
                  disabled={!commentText.trim() || sendingComment}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.sendButton,
                    (!commentText.trim() || sendingComment) && styles.sendButtonDisabled,
                    pressed && !(!commentText.trim() || sendingComment) && { opacity: 0.7 },
                  ]}
                >
                  <Send size={20} color={commentText.trim() && !sendingComment ? theme.accent : theme.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>
            </KeyboardAvoidingView>

            {showMenu && (
              <View style={styles.menuOverlay}>
                <Pressable onPress={() => setShowMenu(false)} style={styles.menuOverlayBackdrop} />
                <View style={[styles.menuContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Pressable onPress={handleDelete} style={styles.menuItem} hitSlop={8}>
                    <Trash2 size={18} color={theme.error} strokeWidth={2} />
                    <ThemedText variant="body" style={{ color: theme.error, marginLeft: Spacing.sm }}>
                      Delete
                    </ThemedText>
                  </Pressable>
                  <Pressable onPress={() => setShowMenu(false)} style={styles.menuItem} hitSlop={8}>
                    <ThemedText variant="body" style={{ color: theme.text }}>
                      Cancel
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            )}
</View>
            </GestureDetector>
          </View>
        </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    height: '65%',
    maxHeight: '95%',
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  dragHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  menuButton: {
    padding: Spacing.xs,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  postCard: {
    gap: Spacing.md,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  postAuthorTextCol: {
    justifyContent: 'center',
    flex: 1,
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  postTimeAgo: {
    fontSize: 12,
    fontWeight: '400',
  },
  photoContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#f0f0f0',
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  textContent: {
    fontSize: 15,
    lineHeight: 22,
  },
  matchIndicator: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
  },
  postSocialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xl,
    paddingTop: Spacing.xs,
  },
  socialAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  pressedSocial: {
    opacity: 0.5,
  },
  socialText: {
    fontSize: 13,
    fontWeight: '600',
  },
  pressedContent: {
    opacity: 0.92,
  },
  commentsSection: {
    gap: Spacing.md,
  },
  commentsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  commentsLoading: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  comment: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  commentContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  commentAuthor: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  commentTime: {
    fontSize: 11,
    fontWeight: '400',
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  noComments: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  inputContainer: {
    padding: Spacing.md,
    paddingBottom: Spacing.lg,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    paddingVertical: 4,
  },
  sendButton: {
    padding: Spacing.xs,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
  },
  menuOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  menuContent: {
    position: 'absolute',
    top: 60,
    right: Spacing.lg,
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    minWidth: 120,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
  },
});