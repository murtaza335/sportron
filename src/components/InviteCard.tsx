import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { CheckCircle, UserPlus, XCircle } from 'lucide-react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { formatRelativeTime } from '@/lib/date';
import { respondToCommunityInvite } from '@/services/communities';

interface InviteCardProps {
  inviteId: string;
  communityName: string;
  inviterName: string;
  createdAt: string;
  onComplete: () => void;
}

export function InviteCard({ inviteId, communityName, inviterName, createdAt, onComplete }: InviteCardProps) {
  const theme = useTheme();
  const { user } = useAuth();
  const [actionResult, setActionResult] = useState<'accepted' | 'rejected' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAccept = async () => {
    if (!user?.id || actionLoading) return;
    setActionLoading(true);
    try {
      await respondToCommunityInvite(inviteId, user.id, true);
      setActionResult('accepted');
      onComplete();
    } catch (err) {
      console.error('Accept invite failed:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Could not accept invite');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDecline = async () => {
    if (!user?.id || actionLoading) return;
    setActionLoading(true);
    try {
      await respondToCommunityInvite(inviteId, user.id, false);
      setActionResult('rejected');
      onComplete();
    } catch (err) {
      console.error('Decline invite failed:', err);
      Alert.alert('Failed', err instanceof Error ? err.message : 'Could not decline invite');
    } finally {
      setActionLoading(false);
    }
  };

  const isDark = theme.resolvedColorScheme === 'dark';
  const unreadBg = isDark ? 'rgba(59, 130, 246, 0.08)' : '#F8FAFF';

  return (
    <View
      style={{
        backgroundColor: actionResult ? theme.background : unreadBg,
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
            backgroundColor: theme.backgroundElement,
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
          <ThemedText variant="caption" muted style={{ fontSize: 11, marginTop: 2 }}>
            {formatRelativeTime(createdAt)}
          </ThemedText>
        </View>
      </View>

      {actionResult === 'accepted' ? (
        <View style={{ marginTop: Spacing.md, marginLeft: 52 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <CheckCircle size={16} color="#16A34A" strokeWidth={2.5} />
            <ThemedText
              variant="caption"
              style={{ fontWeight: '700', fontSize: 13, color: '#16A34A' }}
            >
              Invitation Accepted
            </ThemedText>
          </View>
        </View>
      ) : actionResult === 'rejected' ? (
        <View style={{ marginTop: Spacing.md, marginLeft: 52 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <XCircle size={16} color="#DC2626" strokeWidth={2.5} />
            <ThemedText
              variant="caption"
              style={{ fontWeight: '700', fontSize: 13, color: '#DC2626' }}
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
              backgroundColor: pressed ? theme.backgroundSelected : '#16A34A',
              borderWidth: 1,
              borderColor: '#16A34A',
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
    </View>
  );
}