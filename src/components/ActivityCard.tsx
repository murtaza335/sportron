import { Alert, Pressable, View } from 'react-native';
import { Bell, Check, Swords, UserPlus, X } from 'lucide-react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/date';
import { approveCommitment, rejectCommitment } from '@/services/sessions';
import { updateMatchVerificationStatus } from '@/services/matches';
import { approveCommunityMatch, disputeCommunityMatch, respondToJoinRequest } from '@/services/communities';
import type { InAppNotification } from '@/types';

interface ActivityCardProps {
  notification: InAppNotification;
  onComplete: () => void;
}

function getIcon(type: string, theme: ReturnType<typeof useTheme>) {
  switch (type) {
    case 'session_application':
      return <UserPlus size={20} color={theme.text} strokeWidth={2.2} />;
    case 'join_request':
      return <UserPlus size={20} color={theme.text} strokeWidth={2.2} />;
    case 'match_pending':
    case 'community_match_pending':
    case 'match_approval_request':
      return <Swords size={20} color={theme.text} strokeWidth={2.2} />;
    default:
      return <Bell size={20} color={theme.text} strokeWidth={2.2} />;
  }
}

function getAcceptLabel(type: string): string {
  switch (type) {
    case 'session_application':
      return 'Accept';
    case 'join_request':
      return 'Approve';
    case 'match_pending':
    case 'community_match_pending':
    case 'match_approval_request':
      return 'Accept';
    default:
      return 'Accept';
  }
}

function getDeclineLabel(type: string): string {
  switch (type) {
    case 'session_application':
      return 'Decline';
    case 'join_request':
      return 'Reject';
    case 'match_pending':
    case 'community_match_pending':
    case 'match_approval_request':
      return 'Decline';
    default:
      return 'Decline';
  }
}

export function ActivityCard({ notification, onComplete }: ActivityCardProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const isActionType = [
    'session_application',
    'join_request',
    'match_pending',
    'match_approval_request',
    'community_match_pending',
  ].includes(notification.type);

  const handleAccept = async () => {
    if (!user?.id) return;
    const data = notification.data ?? {};
    try {
      switch (notification.type) {
        case 'match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) { Alert.alert('Error', 'Match not found'); return; }
          await updateMatchVerificationStatus(matchId, 'verified', user.id);
          onComplete();
          return;
        }
        case 'community_match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) { Alert.alert('Error', 'Match not found'); return; }
          await approveCommunityMatch(matchId, user.id);
          onComplete();
          return;
        }
        case 'session_application': {
          const sessionId = data.sessionId as string;
          if (!sessionId) { Alert.alert('Error', 'Session not found'); return; }
          const { supabase } = await import('@/lib/supabase');
          const { data: commitments } = await supabase
            .from('commitments')
            .select('id, user_id')
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!commitments?.length) { Alert.alert('No pending requests'); return; }
          await approveCommitment(commitments[0].id, user.id);
          onComplete();
          return;
        }
        case 'join_request': {
          const communityId = data.communityId as string;
          if (!communityId) { Alert.alert('Error', 'Community not found'); return; }
          const { supabase } = await import('@/lib/supabase');
          const { data: requests } = await supabase
            .from('community_join_requests')
            .select('id')
            .eq('community_id', communityId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!requests?.length) { Alert.alert('No pending requests'); return; }
          await respondToJoinRequest(requests[0].id, 'approved');
          onComplete();
          return;
        }
      }
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  const handleDecline = async () => {
    if (!user?.id) return;
    const data = notification.data ?? {};
    try {
      switch (notification.type) {
        case 'match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) { Alert.alert('Error', 'Match not found'); return; }
          await updateMatchVerificationStatus(matchId, 'disputed', user.id);
          onComplete();
          return;
        }
        case 'community_match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) { Alert.alert('Error', 'Match not found'); return; }
          await disputeCommunityMatch(matchId, user.id);
          onComplete();
          return;
        }
        case 'session_application': {
          const sessionId = data.sessionId as string;
          if (!sessionId) { Alert.alert('Error', 'Session not found'); return; }
          const { supabase } = await import('@/lib/supabase');
          const { data: commitments } = await supabase
            .from('commitments')
            .select('id')
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!commitments?.length) { Alert.alert('No pending requests'); return; }
          await rejectCommitment(commitments[0].id, user.id);
          onComplete();
          return;
        }
        case 'join_request': {
          const communityId = data.communityId as string;
          if (!communityId) { Alert.alert('Error', 'Community not found'); return; }
          const { supabase } = await import('@/lib/supabase');
          const { data: requests } = await supabase
            .from('community_join_requests')
            .select('id')
            .eq('community_id', communityId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!requests?.length) { Alert.alert('No pending requests'); return; }
          await respondToJoinRequest(requests[0].id, 'rejected');
          onComplete();
          return;
        }
      }
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  const isDark = theme.resolvedColorScheme === 'dark';
  const unreadBg = isDark ? 'rgba(59, 130, 246, 0.08)' : '#F8FAFF';

  return (
    <View style={{
      backgroundColor: notification.read ? theme.background : unreadBg,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.md,
    }}>
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        <View style={{
          width: 40,
          height: 40,
          borderRadius: Radius.full,
          backgroundColor: theme.backgroundElement,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {getIcon(notification.type, theme)}
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText
            variant="label"
            style={{ fontWeight: '700', fontSize: 14, lineHeight: 20, textTransform: 'none', letterSpacing: 0 }}
            numberOfLines={1}
          >
            {notification.title}
          </ThemedText>
          <ThemedText variant="caption" muted style={{ fontSize: 13, lineHeight: 18 }} numberOfLines={2}>
            {notification.body}
          </ThemedText>
          <ThemedText variant="caption" muted style={{ fontSize: 11, marginTop: 2 }}>
            {formatRelativeTime(notification.created_at)}
          </ThemedText>
        </View>
        {!notification.read && (
          <View style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#3B82F6',
            marginTop: 6,
          }} />
        )}
      </View>

      {isActionType && (
        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md, marginLeft: 52 }}>
          <Pressable
            onPress={handleAccept}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              borderRadius: Radius.sm,
              backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
              borderWidth: 1,
              borderColor: theme.border,
            })}
            hitSlop={8}
          >
            <Check size={16} color={theme.text} strokeWidth={2.5} />
            <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 13 }}>
              {getAcceptLabel(notification.type)}
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={handleDecline}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: Spacing.sm,
              paddingHorizontal: Spacing.md,
              borderRadius: Radius.sm,
              backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
              borderWidth: 1,
              borderColor: theme.border,
            })}
            hitSlop={8}
          >
            <X size={16} color={theme.textSecondary} strokeWidth={2.5} />
            <ThemedText variant="caption" muted style={{ fontWeight: '700', fontSize: 13 }}>
              {getDeclineLabel(notification.type)}
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}
