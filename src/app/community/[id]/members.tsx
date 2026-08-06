import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { InviteMemberModal } from '@/components/InviteMemberModal';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchCommunityMembers,
  fetchPendingInvites,
  promoteToAdmin,
  removeMember,
} from '@/services/communities';
import type { CommunityInvite, CommunityMember } from '@/types';

export default function CommunityMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<CommunityInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const isAdmin = members.some(
    (m) => m.profile_id === user?.id && m.role === 'admin',
  );

  const userId = user?.id;

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const aIsMe = a.profile_id === userId;
        const bIsMe = b.profile_id === userId;
        if (aIsMe) return -1;
        if (bIsMe) return 1;
        const aIsAdmin = a.role === 'admin';
        const bIsAdmin = b.role === 'admin';
        if (aIsAdmin && !bIsAdmin) return -1;
        if (!aIsAdmin && bIsAdmin) return 1;
        return 0;
      }),
    [members, userId],
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchCommunityMembers(id);
      setMembers(data);
      const amAdmin = data.some((m) => m.profile_id === user?.id && m.role === 'admin');
      if (amAdmin) {
        const invites = await fetchPendingInvites(id);
        setPendingInvites(invites);
      } else {
        setPendingInvites([]);
      }
    } catch (e) {
      console.error('Failed to load members:', e);
    } finally {
      setLoading(false);
    }
  }, [id, user?.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleInviteComplete = async () => {
    setShowInviteModal(false);
    await load();
  };

  // Context menu state
  const [contextMember, setContextMember] = useState<CommunityMember | null>(null);

  const handleRemove = (member: CommunityMember) => {
    setContextMember(null);
    Alert.alert(
      'Remove Member',
      `Remove ${member.profile?.username || 'this member'} from the community?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(id!, member.profile_id);
              setMembers((prev) => prev.filter((m) => m.profile_id !== member.profile_id));
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to remove member.');
            }
          },
        },
      ],
    );
  };

  const handleMakeAdmin = async (member: CommunityMember) => {
    setContextMember(null);
    try {
      await promoteToAdmin(id!, member.profile_id, userId!);
      setMembers((prev) =>
        prev.map((m) =>
          m.profile_id === member.profile_id ? { ...m, role: 'admin' } : m,
        ),
      );
      Alert.alert('Done', `${member.profile?.username || 'User'} is now an admin.`);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to promote member.');
    }
  };

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Members',
          headerStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTintColor: theme.text,
        }}
      />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : (
        <>
          <FlatList
            data={sortedMembers}
            keyExtractor={(item) => item.profile_id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={theme.text}
              />
            }
            ListHeaderComponent={isAdmin ? (
              <>
                <Pressable
                  onPress={() => setShowInviteModal(true)}
                  style={styles.inviteButton}
                  hitSlop={8}
                >
                  <ThemedText variant="body" style={{ color: '#3B82F6', fontWeight: '700' }}>
                    + Invite Member by Username
                  </ThemedText>
                </Pressable>
                {pendingInvites.length > 0 && (
                  <View style={styles.pendingSection}>
                    <ThemedText variant="label" muted style={styles.pendingTitle}>
                      Pending Invites ({pendingInvites.length})
                    </ThemedText>
                    {pendingInvites.map((invite) => (
                      <View
                        key={invite.id}
                        style={[styles.pendingRow, { borderBottomColor: theme.border }]}
                      >
                        <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
                          <ThemedText style={[styles.avatarText, { color: theme.textSecondary }]}>
                            {(invite.invitee?.username ?? '?').charAt(0).toUpperCase()}
                          </ThemedText>
                        </View>
                        <View style={styles.memberInfo}>
                          <ThemedText variant="body" style={{ fontWeight: '600' }}>
                            {invite.invitee?.username ?? 'Unknown'}
                          </ThemedText>
                          <ThemedText variant="caption" muted numberOfLines={1}>
                            Invited by @{invite.inviter?.username ?? 'admin'}
                          </ThemedText>
                        </View>
                        <View style={styles.pendingBadge}>
                          <ThemedText variant="caption" style={{ color: '#3B82F6', fontWeight: '700', fontSize: 11 }}>
                            Invited
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            ) : null}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => router.push(`/profile/${item.profile_id}`)}
                onLongPress={() => {
                  if (isAdmin && item.profile_id !== userId) {
                    setContextMember(item);
                  }
                }}
                style={({ pressed }) => [
                  styles.memberRow,
                  { borderBottomColor: theme.border },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <View style={[styles.avatar, { backgroundColor: item.role === 'admin' ? '#D97706' : theme.textSecondary }]}>
                  <ThemedText style={[styles.avatarText, { color: '#fff' }]}>
                    {(item.profile?.username ?? '?').charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View style={styles.memberInfo}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {item.profile_id === userId
                      ? 'You'
                      : item.profile?.username ?? item.profile_id.slice(0, 8)}
                  </ThemedText>
                  {item.profile?.display_name && (
                    <ThemedText variant="caption" muted numberOfLines={1}>
                      {item.profile.display_name}
                    </ThemedText>
                  )}
                </View>
                {item.role === 'admin' && (
                  <View style={[styles.roleBadge, { backgroundColor: '#D9770620' }]}>
                    <ThemedText variant="caption" style={{ color: '#D97706', fontWeight: '700', fontSize: 11 }}>
                      Admin
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <ThemedText variant="caption" muted style={styles.empty}>
                No members found.
              </ThemedText>
            }
          />
        </>
      )}

      {/* Context Menu Modal */}
      <Modal
        transparent
        visible={!!contextMember}
        animationType="fade"
        onRequestClose={() => setContextMember(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setContextMember(null)}>
          <Pressable style={[styles.contextSheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.contextHandle} />
            <ThemedText variant="heading" style={styles.contextTitle}>
              {contextMember?.profile?.username ?? 'Member'}
            </ThemedText>

            <Pressable
              style={[styles.contextOption, { borderBottomColor: theme.border }]}
              onPress={() => contextMember && handleMakeAdmin(contextMember)}
            >
              <ThemedText variant="body" style={{ fontWeight: '600' }}>
                Make admin
              </ThemedText>
              <ThemedText variant="caption" muted>Promote this member to admin</ThemedText>
            </Pressable>

            <Pressable
              style={styles.contextOption}
              onPress={() => contextMember && handleRemove(contextMember)}
            >
              <ThemedText variant="body" style={{ color: '#EF4444', fontWeight: '600' }}>
                Remove from community
              </ThemedText>
              <ThemedText variant="caption" muted>Kick this member out</ThemedText>
            </Pressable>

            <Pressable
              onPress={() => setContextMember(null)}
              style={[styles.contextCancel, { borderTopColor: theme.border }]}
            >
              <ThemedText variant="body" style={{ color: theme.textSecondary, fontWeight: '600' }}>
                Cancel
              </ThemedText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Invite Member Modal */}
      <InviteMemberModal
        communityId={id!}
        adminId={userId!}
        visible={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={handleInviteComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  inviteButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  pendingSection: {
    paddingVertical: Spacing.md,
  },
  pendingTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pendingBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: '#3B82F620',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  empty: { textAlign: 'center', paddingVertical: Spacing.xxl },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contextSheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.lg,
    gap: Spacing.sm,
  },
  contextHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  contextTitle: {
    marginBottom: Spacing.sm,
  },
  contextOption: {
    paddingVertical: Spacing.md,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextCancel: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
