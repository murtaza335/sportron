import { Globe, Heart, Lock, MessageSquare } from 'lucide-react-native';
import { useState, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { toggleLike } from '@/services/matches';
import type { MatchWithProfiles } from '@/types';

type MatchCardProps = {
  match: MatchWithProfiles;
  currentUserId?: string;
  showYoursBadge?: boolean;
  onPress?: () => void;
};

function getOpponentName(match: MatchWithProfiles, currentUserId?: string) {
  const op1 = match.opponent?.id === currentUserId ? 'You' : match.opponent?.display_name;
  const op2 = match.opponentPartner?.id === currentUserId ? 'You' : match.opponentPartner?.display_name;
  const opponentNames = [op1, op2].filter(Boolean);

  if (opponentNames.length > 0) {
    return opponentNames.join(' + ');
  }

  return match.opponent_guest_name ?? 'Guest';
}

function getTeamAName(match: MatchWithProfiles, currentUserId?: string) {
  const p1 = match.player?.id === currentUserId ? 'You' : (match.player?.display_name ?? 'Player A');
  const p2 = match.playerPartner?.id === currentUserId ? 'You' : match.playerPartner?.display_name;
  return [p1, p2].filter(Boolean).join(' + ');
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function MatchCard({ match, currentUserId, showYoursBadge = true, onPress }: MatchCardProps) {
  const theme = useTheme();
  const playerName = getTeamAName(match, currentUserId);
  const opponentName = getOpponentName(match, currentUserId);

  const [liked, setLiked] = useState(match.is_liked_by_user);
  const [likesCount, setLikesCount] = useState(match.likes_count);

  const isParticipant = useMemo(() =>
    currentUserId &&
    (currentUserId === match.player_id ||
      currentUserId === match.player_partner_id ||
      currentUserId === match.opponent_id ||
      currentUserId === match.opponent_partner_id),
  [currentUserId, match.player_id, match.player_partner_id, match.opponent_id, match.opponent_partner_id]);

  const isPlayerTeam = useMemo(() =>
    currentUserId &&
    (currentUserId === match.player_id || currentUserId === match.player_partner_id),
  [currentUserId, match.player_id, match.player_partner_id]);

  const isOpponentTeam = useMemo(() =>
    currentUserId &&
    (currentUserId === match.opponent_id || currentUserId === match.opponent_partner_id),
  [currentUserId, match.opponent_id, match.opponent_partner_id]);

  const resultLabel = useMemo((): 'Win' | 'Loss' | 'Draw' | null => {
    if (!isParticipant) return null;
    if (match.player_score === match.opponent_score) return 'Draw';
    if (isPlayerTeam) return match.player_score > match.opponent_score ? 'Win' : 'Loss';
    if (isOpponentTeam) return match.opponent_score > match.player_score ? 'Win' : 'Loss';
    return null;
  }, [isParticipant, isPlayerTeam, isOpponentTeam, match.player_score, match.opponent_score]);

  const isMine = currentUserId === match.created_by;
  const formatLabel = match.match_format === 'doubles' ? 'Doubles' : 'Singles';

  const handleLike = async () => {
    if (!currentUserId) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      await toggleLike(match.id, currentUserId, nextLiked);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      // Revert state
      setLiked(!nextLiked);
      setLikesCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed,
      ]}
    >
      <Card style={styles.card}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <ThemedText variant="caption" muted style={styles.dateText}>
              {formatDate(match.created_at)}
            </ThemedText>
            {match.is_public ? (
              <Globe size={12} color={theme.textSecondary} />
            ) : (
              <Lock size={12} color={theme.textSecondary} />
            )}
          </View>

          <View style={styles.badges}>
            <ThemedText
              variant="caption"
              style={[
                styles.badge,
                { backgroundColor: theme.backgroundElement, color: theme.textSecondary }
              ]}
            >
              {formatLabel}
            </ThemedText>
            <ThemedText
              variant="caption"
              style={[
                styles.badge,
                { borderWidth: 1, textTransform: 'capitalize' },
                match.verification_status === 'verified' && { borderColor: theme.border, color: theme.textSecondary },
                match.verification_status === 'pending' && { borderColor: theme.border, color: '#D97706' },
                match.verification_status === 'disputed' && { borderColor: theme.border, color: '#DC2626' },
              ]}
            >
              {match.verification_status}
            </ThemedText>
            {isMine && showYoursBadge ? (
              <ThemedText
                variant="caption"
                style={[
                  styles.badge,
                  { backgroundColor: theme.text, color: theme.background }
                ]}
              >
                Yours
              </ThemedText>
            ) : null}
          </View>
        </View>

        <View style={styles.bodyRow}>
          <View style={styles.teamLeft}>
            <ThemedText
              variant="body"
              numberOfLines={2}
              style={[
                styles.teamName,
                isPlayerTeam && styles.teamNameActive
              ]}
            >
              {playerName}
            </ThemedText>
          </View>

          <View style={styles.scoreCenter}>
            <ThemedText style={styles.scoreText}>
              {match.player_score} – {match.opponent_score}
            </ThemedText>

            {resultLabel === 'Win' && (
              <View style={[styles.resultBadge, { backgroundColor: '#10B98115' }]}>
                <ThemedText style={[styles.resultText, { color: '#10B981' }]}>Win</ThemedText>
              </View>
            )}
            {resultLabel === 'Loss' && (
              <View style={[styles.resultBadge, { backgroundColor: '#EF444415' }]}>
                <ThemedText style={[styles.resultText, { color: '#EF4444' }]}>Loss</ThemedText>
              </View>
            )}
            {resultLabel === 'Draw' && (
              <View style={[styles.resultBadge, { backgroundColor: '#6B728015' }]}>
                <ThemedText style={[styles.resultText, { color: '#6B7280' }]}>Draw</ThemedText>
              </View>
            )}
          </View>

          <View style={styles.teamRight}>
            <ThemedText
              variant="body"
              numberOfLines={2}
              style={[
                styles.teamName,
                isOpponentTeam && styles.teamNameActive,
                { textAlign: 'right' }
              ]}
            >
              {opponentName}
            </ThemedText>
          </View>
        </View>

        {/* Social Row */}
        <View style={[styles.socialRow, { borderTopColor: theme.border }]}>
          <Pressable
            onPress={handleLike}
            hitSlop={12}
            style={styles.socialAction}
          >
            <Heart
              size={13}
              color={liked ? '#EF4444' : theme.textSecondary}
              fill={liked ? '#EF4444' : 'none'}
            />
            <ThemedText variant="caption" style={[styles.socialText, { color: liked ? '#EF4444' : theme.textSecondary }]}>
              {likesCount} {likesCount === 1 ? 'like' : 'likes'}
            </ThemedText>
          </Pressable>

          <View style={styles.socialAction}>
            <MessageSquare size={13} color={theme.textSecondary} />
            <ThemedText variant="caption" muted style={styles.socialText}>
              {match.comments_count || 0} {match.comments_count === 1 ? 'comment' : 'comments'}
            </ThemedText>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  card: {
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  dateText: {
    fontSize: 12,
    fontWeight: '500',
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  badge: {
    fontSize: 9,
    fontWeight: '800',
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    textTransform: 'uppercase',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
    gap: Spacing.xs,
  },
  teamLeft: {
    flex: 1.2,
    alignItems: 'flex-start',
  },
  teamRight: {
    flex: 1.2,
    alignItems: 'flex-end',
  },
  teamName: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  teamNameActive: {
    fontWeight: '700',
  },
  scoreCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minWidth: 74,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  resultBadge: {
    paddingHorizontal: Spacing.sm - 2,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  resultText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
  },
  socialAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  socialText: {
    fontSize: 11,
    fontWeight: '600',
  },
});