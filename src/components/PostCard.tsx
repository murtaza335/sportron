import { useRouter } from 'expo-router';
import { Heart, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/date';
import { deleteCommunityPost, toggleCommunityPostLike } from '@/services/communities';
import type { CommunityPost } from '@/types';

type PostCardProps = {
  post: CommunityPost;
  currentUserId?: string;
  onPress?: () => void;
  onCommentPress?: () => void;
  communityId?: string;
  showYoursBadge?: boolean;
};

export function PostCard({
  post,
  currentUserId,
  onPress,
  onCommentPress,
  communityId,
  showYoursBadge = true,
}: PostCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const [liked, setLiked] = useState(post.is_liked_by_user ?? false);
  const [likesCount, setLikesCount] = useState(post.likes_count ?? 0);
  const [showMenu, setShowMenu] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isMine = currentUserId === post.author_id;

  const handleLike = async () => {
    if (!currentUserId) return;
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

  const handleDelete = async () => {
    if (!currentUserId) return;
    Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCommunityPost(post.id, currentUserId);
          } catch (error) {
            console.error('Failed to delete post:', error);
            Alert.alert('Error', 'Failed to delete post');
          }
        },
      },
    ]);
    setShowMenu(false);
  };

  const handlePress = () => {
    if (onPress) onPress();
  };

  const handleCommentPress = () => {
    if (onCommentPress) {
      onCommentPress();
    } else if (onPress) {
      onPress();
    }
  };

  const renderContent = () => {
    if (post.post_type === 'photo' && post.image_url) {
      return (
        <View style={styles.mediaAndTextWrapper}>
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
                <ThemedText variant="caption" muted>
                  Failed to load image
                </ThemedText>
              </View>
            )}
          </View>

          {!!post.content && (
            <ThemedText variant="body" style={styles.textContent} numberOfLines={10}>
              {post.content}
            </ThemedText>
          )}
        </View>
      );
    }

    if ((post.post_type === 'text' || post.post_type === 'photo') && post.content) {
      return (
        <ThemedText variant="body" style={styles.textContent} numberOfLines={10}>
          {post.content}
        </ThemedText>
      );
    }

    if (post.post_type === 'match') {
      return (
        <View style={styles.matchIndicator}>
          <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '600' }}>
            Match recorded
          </ThemedText>
        </View>
      );
    }

    return null;
  };

  return (
    <Card
      bordered={false}
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, borderWidth: 1 },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.authorRow}>
          <Pressable
            disabled={!post.author?.id}
            onPress={() => {
              if (post.author?.id) {
                router.push(`/profile/${post.author.id}${communityId ? `?community=${communityId}` : ''}`);
              }
            }}
            style={({ pressed }) => pressed && styles.pressedContent}
          >
            <UserAvatar avatarUrl={post.author?.avatar_url} size={36} />
          </Pressable>
          <View style={styles.authorTextCol}>
            <Pressable
              disabled={!post.author?.id}
              onPress={() => {
                if (post.author?.id) {
                  router.push(`/profile/${post.author.id}${communityId ? `?community=${communityId}` : ''}`);
                }
              }}
              style={({ pressed }) => pressed && styles.pressedContent}
            >
              <ThemedText variant="body" style={styles.authorName} numberOfLines={1}>
                {post.author?.username ?? 'Unknown'}
              </ThemedText>
            </Pressable>
            <ThemedText variant="caption" muted style={styles.timeAgo}>
              {formatRelativeTime(post.created_at)}
            </ThemedText>
          </View>
        </View>

        {isMine && showYoursBadge && (
          <View style={styles.yoursBadge}>
            <ThemedText variant="caption" style={{ color: theme.background, fontWeight: '700' }}>
              Yours
            </ThemedText>
          </View>
        )}

        {isMine && (
          <Pressable
            onPress={() => setShowMenu(true)}
            hitSlop={12}
            style={({ pressed }) => [styles.menuButton, pressed && { opacity: 0.6 }]}
          >
            <MoreHorizontal size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
        )}
      </View>

      <Pressable onPress={handlePress} style={({ pressed }) => [styles.contentWrapper, pressed && styles.pressedContent]}>
        {renderContent()}
      </Pressable>

      <View style={styles.socialRow}>
        <Pressable onPress={handleLike} hitSlop={8} style={({ pressed }) => [styles.socialAction, pressed && styles.pressedSocial]}>
          <Heart size={16} color={liked ? theme.error : theme.textSecondary} fill={liked ? theme.error : 'none'} />
          <ThemedText variant="caption" style={[styles.socialText, { color: liked ? theme.error : theme.textSecondary }]}>
            {likesCount} {likesCount === 1 ? 'like' : 'likes'}
          </ThemedText>
        </Pressable>

        <Pressable onPress={handleCommentPress} hitSlop={8} style={({ pressed }) => [styles.socialAction, pressed && styles.pressedSocial]}>
          <MessageSquare size={16} color={theme.textSecondary} />
          <ThemedText variant="caption" muted style={styles.socialText}>
            {post.comments_count ?? 0} {(post.comments_count ?? 0) === 1 ? 'comment' : 'comments'}
          </ThemedText>
        </Pressable>
      </View>

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
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  authorTextCol: {
    justifyContent: 'center',
    flex: 1,
  },
  authorName: {
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  timeAgo: {
    fontSize: 11,
    fontWeight: '400',
  },
  yoursBadge: {
    paddingHorizontal: Spacing.xs + 3,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: '#000',
  },
  menuButton: {
    padding: Spacing.xs,
  },
  contentWrapper: {
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  mediaAndTextWrapper: {
    gap: Spacing.xs,
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
    paddingVertical: Spacing.xs,
  },
  matchIndicator: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingTop: 2,
    paddingBottom: Spacing.xs,
  },
  socialAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  pressedSocial: {
    opacity: 0.5,
  },
  socialText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pressedContent: {
    opacity: 0.92,
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
    top: 50,
    right: Spacing.md,
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