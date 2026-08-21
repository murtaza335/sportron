import { Heart, MessageSquare } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/date';
import { toggleCommunityMatchLike } from '@/services/communities';
import type { MatchWithProfiles, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';

type MatchCardProps = {
  match: MatchWithProfiles;
  currentUserId?: string;
  showYoursBadge?: boolean;
  onPress?: () => void;
};

function getOpponentName(match: MatchWithProfiles, currentUserId?: string) {
  if (match.team_b_name) return match.team_b_name;

  const op1 = match.opponent?.id === currentUserId ? 'You' : match.opponent?.username;
  const op2 = match.opponentPartner?.id === currentUserId ? 'You' : match.opponentPartner?.username;
  const opponentNames = [op1, op2].filter(Boolean);

  if (opponentNames.length > 0) {
    return opponentNames.join(' + ');
  }

  return match.opponent_guest_name ?? 'Guest';
}

function getOpponentCaptain(match: MatchWithProfiles) {
  if (match.team_b_name && match.opponent?.username) {
    return match.opponent.username;
  }
  return null;
}

function getTeamAName(match: MatchWithProfiles, currentUserId?: string) {
  if (match.team_a_name) return match.team_a_name;

  const p1 = match.player?.id === currentUserId ? 'You' : (match.player?.username ?? 'Player A');
  const p2 = match.playerPartner?.id === currentUserId ? 'You' : match.playerPartner?.username;
  return [p1, p2].filter(Boolean).join(' + ');
}

export function MatchCard({ match, currentUserId, showYoursBadge = true, onPress }: MatchCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const playerName = getTeamAName(match, currentUserId);
  const opponentName = getOpponentName(match, currentUserId);
  const opponentCaptain = getOpponentCaptain(match);

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

  const playerWon = match.player_score > match.opponent_score;
  const opponentWon = match.opponent_score > match.player_score;

  const resultLabel = useMemo((): 'Win' | 'Loss' | 'Draw' | null => {
    if (!isParticipant) return null;
    if (match.player_score === match.opponent_score) return 'Draw';
    if (isPlayerTeam) return playerWon ? 'Win' : 'Loss';
    if (isOpponentTeam) return opponentWon ? 'Win' : 'Loss';
    return null;
  }, [isParticipant, isPlayerTeam, isOpponentTeam, playerWon, opponentWon, match.player_score, match.opponent_score]);

  const isMine = currentUserId === match.created_by;
  const formatLabel = match.match_format === 'doubles' ? 'Doubles' : 'Singles';
  const sportLabel = SPORT_LABELS[match.sport as Sport] || match.custom_sport_name || match.sport;

  // Header user info
  const recorderProfile = match.recorder ?? match.player;
  const recorderName = recorderProfile?.username ?? playerName;
  const recorderAvatar = recorderProfile?.avatar_url;

  const handleLike = async () => {
    if (!currentUserId) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikesCount((prev) => (nextLiked ? prev + 1 : Math.max(0, prev - 1)));

    try {
      await toggleCommunityMatchLike(match.id, currentUserId, nextLiked);
    } catch (error) {
      console.error('Failed to toggle like:', error);
      setLiked(!nextLiked);
      setLikesCount((prev) => (!nextLiked ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const statusStyle = useMemo(() => {
    switch (match.verification_status) {
      case 'disputed':
        return {
          bg: '#DC26261F',
          color: '#EF4444',
          label: 'Disputed',
        };
      case 'pending':
        return {
          bg: '#D977061F',
          color: '#D97706',
          label: 'Pending',
        };
      default:
        return {
          bg: '#10B9811F',
          color: '#10B981',
          label: 'Verified',
        };
    }
  }, [match.verification_status]);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.pressable,
        pressed && styles.pressed,
      ]}
    >
      <Card bordered={false} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
        {/* Post Header */}
        <View style={styles.header}>
           <Pressable
             style={styles.authorRow}
             disabled={!recorderProfile?.id}
             onPress={() => {
               if (recorderProfile?.id) router.push(`/profile/${recorderProfile.id}`);
             }}
           >
             <UserAvatar avatarUrl={recorderAvatar} size={36} />
             <View style={styles.authorTextCol}>
               <ThemedText variant="body" style={styles.authorName} numberOfLines={1}>
                 {recorderName}
               </ThemedText>
               <ThemedText variant="caption" muted style={styles.timeAgo}>
                 {formatRelativeTime(match.created_at)}
               </ThemedText>
             </View>
           </Pressable>

          <View style={styles.badges}>
            

            <View style={[styles.badgePill, { backgroundColor: statusStyle.bg }]}>
              <ThemedText variant="caption" style={[styles.badgeText, { color: statusStyle.color, fontWeight: '700' }]}>
                {statusStyle.label}
              </ThemedText>
            </View>

            {isMine && showYoursBadge ? (
              <View style={[styles.badgePill, { backgroundColor: theme.text }]}>
                <ThemedText variant="caption" style={[styles.badgeText, { color: theme.background, fontWeight: '700' }]}>
                  Yours
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        {/* Matchup Score Box */}
        <View style={[styles.matchupContainer, { backgroundColor: theme.background }]}>
          <View style={styles.teamLeft}>
            <ThemedText
              variant="body"
              numberOfLines={2}
              style={[
                styles.teamName,
                playerWon && styles.winningTeamName,
                isPlayerTeam && !playerWon && styles.userTeamName,
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
              <View style={[styles.resultBadge, { backgroundColor: '#10B9811F' }]}>
                <ThemedText style={[styles.resultText, { color: '#10B981' }]}>Win</ThemedText>
              </View>
            )}
            {resultLabel === 'Loss' && (
              <View style={[styles.resultBadge, { backgroundColor: '#EF44441F' }]}>
                <ThemedText style={[styles.resultText, { color: '#EF4444' }]}>Loss</ThemedText>
              </View>
            )}
            {resultLabel === 'Draw' && (
              <View style={[styles.resultBadge, { backgroundColor: '#6B72801F' }]}>
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
                opponentWon && styles.winningTeamName,
                isOpponentTeam && !opponentWon && styles.userTeamName,
                { textAlign: 'right' },
              ]}
            >
              {opponentName}
            </ThemedText>
            {opponentCaptain && (
              <ThemedText variant="caption" muted style={{ textAlign: 'right', fontSize: 11 }}>
                {opponentCaptain}
              </ThemedText>
            )}
          </View>
        </View>

        {/* Social Row Footer */}
        <View style={styles.socialRow}>
          <Pressable
            onPress={handleLike}
            hitSlop={8}
            style={styles.socialAction}
          >
            <Heart
              size={16}
              color={liked ? '#EF4444' : theme.textSecondary}
              fill={liked ? '#EF4444' : 'none'}
            />
            <ThemedText variant="caption" style={[styles.socialText, { color: liked ? '#EF4444' : theme.textSecondary }]}>
              {likesCount} {likesCount === 1 ? 'like' : 'likes'}
            </ThemedText>
          </Pressable>

          <View style={styles.socialAction}>
            <MessageSquare size={16} color={theme.textSecondary} />
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
    marginBottom: Spacing.sm,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  card: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  authorTextCol: {
    justifyContent: 'center',
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
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  badgePill: {
    paddingHorizontal: Spacing.xs + 3,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  matchupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
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
  winningTeamName: {
    fontWeight: '800',
  },
  userTeamName: {
    fontWeight: '600',
  },
  scoreCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minWidth: 70,
  },
  scoreText: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  resultBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 1.5,
    borderRadius: Radius.full,
  },
  resultText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    paddingTop: 2,
  },
  socialAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  socialText: {
    fontSize: 12,
    fontWeight: '600',
  },
});