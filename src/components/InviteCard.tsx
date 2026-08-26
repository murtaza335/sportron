import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CheckCircle, UserPlus, XCircle } from 'lucide-react-native';

import { alert } from '@/lib/alert';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/date';
import { supabase } from '@/lib/supabase';
import { respondToCommunityInvite } from '@/services/communities';

interface InviteCardProps {
  notificationId: string;
  inviteId: string;
  communityName: string;
  inviterName: string;
  createdAt: string;
  onComplete: () => void;
}

export function InviteCard({ notificationId, inviteId, communityName, inviterName, createdAt, onComplete }: InviteCardProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const { markAsRead } = useNotifications();
  const [actionResult, setActionResult] = useState<'accepted' | 'rejected' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const resolveNotification = async (accepted: boolean) => {
    try {
      await supabase
        .from('in_app_notifications')
        .update({
          type: accepted ? 'community_invite_accepted' : 'community_invite_rejected',
          read: true,
        })
        .eq('id', notificationId);
    } catch (e) {
      console.error('Failed to resolve invite notification:', e);
    }
  };

  const handleAccept = async () => {
    if (!user?.id || actionLoading) return;
    setActionLoading(true);
    try {
      await respondToCommunityInvite(inviteId, user.id, true);
      await resolveNotification(true);
      setActionResult('accepted');
      onComplete();
    } catch (err) {
      console.error('Accept invite failed:', err);
      alert('Failed', err instanceof Error ? err.message : 'Could not accept invite');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user?.id || actionLoading) return;
    setActionLoading(true);
    try {
      await respondToCommunityInvite(inviteId, user.id, false);
      await resolveNotification(false);
      setActionResult('rejected');
      onComplete();
    } catch (err) {
      console.error('Decline invite failed:', err);
      alert('Failed', err instanceof Error ? err.message : 'Could not decline invite');
    } finally {
      setActionLoading(false);
    }
  };

  const isDark = theme.resolvedColorScheme === 'dark';
  const unreadBg = isDark ? 'rgba(0, 168, 181, 0.08)' : 'rgba(0, 168, 181, 0.04)';

  return (
    <Pressable
      onPress={() => markAsRead(notificationId)}
      style={{
        backgroundColor: actionResult ? theme.backgroundElement : unreadBg,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', gap: Spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: Radius.full,
            backgroundColor: theme.backgroundSelected,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <UserPlus size={20} color={theme.text} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText
            variant="body"
            style={{ fontWeight: '600', fontSize: 15, lineHeight: 22, color: theme.text }}
            numberOfLines={3}
          >
            {inviterName} invited you to {communityName}
          </ThemedText>
          <ThemedText
            variant="caption"
            style={{ fontSize: 12, fontWeight: '500', marginTop: 2, color: theme.textSecondary }}
          >
            {formatRelativeTime(createdAt)}
          </ThemedText>
        </View>
      </View>

      {actionResult === 'accepted' ? (
        <View style={{ marginTop: Spacing.md, marginLeft: 52 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={16} color={theme.success} strokeWidth={2.5} />
            <ThemedText
              variant="caption"
              style={{ fontWeight: '700', fontSize: 13, color: theme.success }}
            >
              Invitation Accepted
            </ThemedText>
          </View>
        </View>
      ) : actionResult === 'rejected' ? (
        <View style={{ marginTop: Spacing.md, marginLeft: 52 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <XCircle size={16} color={theme.error} strokeWidth={2.5} />
            <ThemedText
              variant="caption"
              style={{ fontWeight: '700', fontSize: 13, color: theme.error }}
            >
              Invitation Declined
            </ThemedText>
          </View>
        </View>
      ) : actionLoading ? (
        <View style={{ marginTop: Spacing.md, marginLeft: 52 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ThemedText variant="caption" muted style={{ fontSize: 13 }}>
              Processing...
            </ThemedText>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: Spacing.md, marginLeft: 52, flexDirection: 'row', gap: Spacing.sm }}>
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
              backgroundColor: pressed ? theme.backgroundSelected : theme.success,
              borderWidth: 1,
              borderColor: theme.success,
              opacity: actionLoading ? 0.5 : 1,
            })}
            hitSlop={8}
          >
            <CheckCircle size={16} color="white" strokeWidth={2.5} />
            <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 13, color: 'white' }}>
              Accept
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
            <XCircle size={16} color={theme.textSecondary} strokeWidth={2.5} />
            <ThemedText variant="caption" muted style={{ fontWeight: '700', fontSize: 13 }}>
              Decline
            </ThemedText>
          </Pressable>
        </View>
      )}
    </Pressable>
  );
}