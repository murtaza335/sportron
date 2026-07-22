import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Bell, Check, CheckCircle, Swords, UserPlus, X, XCircle } from 'lucide-react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/date';
import { supabase } from '@/lib/supabase';
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
    case 'join_request': return 'Approve';
    default: return 'Accept';
  }
}

function getDeclineLabel(type: string): string {
  switch (type) {
    case 'join_request': return 'Reject';
    default: return 'Decline';
  }
}

const ACTION_TYPES = [
  'session_application',
  'join_request',
  'match_pending',
  'match_approval_request',
  'community_match_pending',
];

export function ActivityCard({ notification, onComplete }: ActivityCardProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const [actionResult, setActionResult] = useState<'accepted' | 'declined' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [sessionInfo, setSessionInfo] = useState<{ sport: string; location: string } | null>(null);

  const isActionType = ACTION_TYPES.includes(notification.type);
  const data = notification.data ?? {};

  useEffect(() => {
    if (notification.type === 'session_application') {
      const sessionId = data.sessionId as string;
      if (!sessionId) return;
      supabase
        .from('sessions')
        .select('sport, location')
        .eq('id', sessionId)
        .single()
        .then(({ data: s }) => {
          if (s) setSessionInfo(s);
        })
        .catch(() => {});
    }
  }, [notification.type, data.sessionId]);

  const applicantName = notification.type === 'session_application'
    ? notification.body.replace(' applied to your session', '').trim()
    : null;

  const displayBody = (): string => {
    switch (notification.type) {
      case 'session_application':
        if (sessionInfo) {
          return `wanna let ${applicantName} in ${sessionInfo.sport} at ${sessionInfo.location}?`;
        }
        return `wanna let ${applicantName ?? 'someone'} in your session?`;
      case 'join_request':
        return notification.body;
      case 'match_pending':
        return notification.body;
      case 'community_match_pending':
        return notification.body;
      default:
        return notification.body;
    }
  };

  const markRead = async () => {
    try {
      await supabase
        .from('in_app_notifications')
        .update({ read: true })
        .eq('id', notification.id);
    } catch {
      // fire-and-forget
    }
  };

  const handleAccept = async () => {
    if (!user?.id || actionLoading) return;
    setActionLoading(true);
    try {
      switch (notification.type) {
        case 'match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) throw new Error('Match not found');
          await updateMatchVerificationStatus(matchId, 'verified', user.id);
          break;
        }
        case 'community_match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) throw new Error('Match not found');
          await approveCommunityMatch(matchId, user.id);
          break;
        }
        case 'session_application': {
          const sessionId = data.sessionId as string;
          if (!sessionId) throw new Error('Session not found');
          const { data: commitments } = await supabase
            .from('commitments')
            .select('id')
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!commitments?.length) throw new Error('No pending requests');
          await approveCommitment(commitments[0].id, user.id);
          break;
        }
        case 'join_request': {
          const communityId = data.communityId as string;
          if (!communityId) throw new Error('Community not found');
          const { data: requests } = await supabase
            .from('community_join_requests')
            .select('id')
            .eq('community_id', communityId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!requests?.length) throw new Error('No pending requests');
          await respondToJoinRequest(requests[0].id, 'approved');
          break;
        }
      }
      setActionResult('accepted');
      await markRead();
      onComplete();
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user?.id || actionLoading) return;
    setActionLoading(true);
    try {
      switch (notification.type) {
        case 'match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) throw new Error('Match not found');
          await updateMatchVerificationStatus(matchId, 'disputed', user.id);
          break;
        }
        case 'community_match_pending': {
          const matchId = data.matchId as string;
          if (!matchId) throw new Error('Match not found');
          await disputeCommunityMatch(matchId, user.id);
          break;
        }
        case 'session_application': {
          const sessionId = data.sessionId as string;
          if (!sessionId) throw new Error('Session not found');
          const { data: commitments } = await supabase
            .from('commitments')
            .select('id')
            .eq('session_id', sessionId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!commitments?.length) throw new Error('No pending requests');
          await rejectCommitment(commitments[0].id, user.id);
          break;
        }
        case 'join_request': {
          const communityId = data.communityId as string;
          if (!communityId) throw new Error('Community not found');
          const { data: requests } = await supabase
            .from('community_join_requests')
            .select('id')
            .eq('community_id', communityId)
            .eq('status', 'pending')
            .order('created_at', { ascending: true })
            .limit(1);
          if (!requests?.length) throw new Error('No pending requests');
          await respondToJoinRequest(requests[0].id, 'rejected');
          break;
        }
      }
      setActionResult('declined');
      await markRead();
      onComplete();
    } catch (err) {
      Alert.alert('Action failed', err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setActionLoading(false);
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
            variant="body"
            style={{ fontWeight: '600', fontSize: 15, lineHeight: 22 }}
            numberOfLines={3}
          >
            {displayBody()}
          </ThemedText>
          <ThemedText variant="caption" muted style={{ fontSize: 11, marginTop: 2 }}>
            {formatRelativeTime(notification.created_at)}
          </ThemedText>
        </View>
        {!notification.read && !actionResult && (
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
        <View style={{ marginTop: Spacing.md, marginLeft: 52 }}>
          {actionResult === 'accepted' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={16} color="#16A34A" strokeWidth={2.5} />
              <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 13, color: '#16A34A' }}>
                {getAcceptLabel(notification.type)}ed
              </ThemedText>
            </View>
          ) : actionResult === 'declined' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <XCircle size={16} color="#DC2626" strokeWidth={2.5} />
              <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 13, color: '#DC2626' }}>
                {getDeclineLabel(notification.type)}ed
              </ThemedText>
            </View>
          ) : actionLoading ? (
            <ActivityIndicator size="small" color={theme.text} />
          ) : (
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <Pressable
                onPress={handleAccept}
                disabled={actionLoading}
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
                  opacity: actionLoading ? 0.5 : 1,
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
                disabled={actionLoading}
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
                  opacity: actionLoading ? 0.5 : 1,
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
      )}
    </View>
  );
}
