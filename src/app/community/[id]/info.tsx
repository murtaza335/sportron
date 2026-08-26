import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Globe,
  Image as ImageIcon,
  Lock,
  LogOut,
  MapPin,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  User,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { useCommunity } from '@/hooks/useCommunity';
import {
  deleteCommunity,
  fetchCommunityMembers,
  joinCommunity,
  leaveCommunity,
  promoteToAdmin,
  removeMember,
  requestToJoinCommunity,
  setPingsEnabled,
} from '@/services/communities';
import { fetchProfile } from '@/services/profiles';
import type { CommunityMember, Profile } from '@/types';
import { SPORT_LABELS } from '@/types';

export default function CommunityInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const {
    community,
    membership,
    myPendingInvite,
    myJoinRequest,
    loading,
    refresh,
    setMembership,
  } = useCommunity(id ?? '', user?.id);

  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [creator, setCreator] = useState<Profile | null>(null);

  const [pingsEnabledOverride, setPingsEnabledOverride] = useState<boolean | null>(null);
  const pingsEnabled = pingsEnabledOverride ?? community?.pings_enabled ?? true;

  const handleTogglePings = async (value: boolean) => {
    if (!id) return;
    const previous = community?.pings_enabled ?? true;
    setPingsEnabledOverride(value);
    try {
      await setPingsEnabled(id, value);
    } catch (e: any) {
      setPingsEnabledOverride(previous);
      alert('Error', e?.message ?? 'Failed to update ping settings.');
    }
  };

  const loadMembers = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchCommunityMembers(id);
      setMembers(data);
    } catch (e) {
      console.error('Failed to load members:', e);
    } finally {
      setMembersLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
    }, [loadMembers]),
  );

  const isMember = !!membership;
  const isAdmin = membership?.role === 'admin';
  const isRestricted = community?.visibility === 'restricted';

  const sortedMembers = useMemo(
    () =>
      [...members].sort((a, b) => {
        const aIsMe = a.profile_id === user?.id;
        const bIsMe = b.profile_id === user?.id;
        if (aIsMe) return -1;
        if (bIsMe) return 1;
        const aIsAdmin = a.role === 'admin';
        const bIsAdmin = b.role === 'admin';
        if (aIsAdmin && !bIsAdmin) return -1;
        if (!aIsAdmin && bIsAdmin) return 1;
        return 0;
      }),
    [members, user?.id],
  );

  const displayMembers = sortedMembers.slice(0, 10);
  const hasMoreMembers = sortedMembers.length > 10;

  useEffect(() => {
    if (community?.created_by) {
      fetchProfile(community.created_by).then(setCreator).catch(console.error);
    }
  }, [community?.created_by]);

  const handleJoin = async () => {
    if (!id || !user) return;
    try {
      if (isRestricted) {
        await requestToJoinCommunity(id, user.id);
        alert('Request Sent', 'The admin will review your request.');
      } else {
        await joinCommunity(id, user.id);
        setMembership({
          community_id: id,
          profile_id: user.id,
          role: 'member',
          approval_status: 'approved',
          matches_played: 0,
          wins: 0,
          losses: 0,
          win_ratio: 0,
          joined_at: new Date().toISOString(),
        });
      }
      refresh();
    } catch (e: any) {
      alert('Error', e?.message ?? 'Failed to join.');
    }
  };

  const handleLeave = () => {
    if (!id || !user) return;
    alert(
      'Leave Community',
      'Are you sure you want to leave this community?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            try {
              await leaveCommunity(id, user.id);
              setMembership(null);
              refresh();
              router.back();
            } catch (e: any) {
              alert('Error', e?.message ?? 'Failed to leave.');
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    if (!id) return;
    alert(
      'Delete Community',
      'This action cannot be undone. All matches, members, and data will be permanently removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCommunity(id);
              router.back();
            } catch (e: any) {
              alert('Error', e?.message ?? 'Failed to delete community.');
            }
          },
        },
      ],
    );
  };

  const handleMakeAdmin = async (member: CommunityMember) => {
    try {
      await promoteToAdmin(id!, member.profile_id, user!.id);
      setMembers((prev) =>
        prev.map((m) =>
          m.profile_id === member.profile_id ? { ...m, role: 'admin' } : m,
        ),
      );
    } catch (e: any) {
      alert('Error', e?.message ?? 'Failed to promote member.');
    }
  };

  const handleRemove = (member: CommunityMember) => {
    alert(
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
              alert('Error', e?.message ?? 'Failed to remove member.');
            }
          },
        },
      ],
    );
  };

  const themedHeader = {
    headerStyle: { backgroundColor: theme.background },
    headerShadowVisible: false,
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    headerLeft: () => (
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [
          { marginRight: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
          pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 0.92 }] },
        ]}
      >
        <ChevronLeft size={24} color={theme.text} />
      </Pressable>
    ),
  };

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '', ...themedHeader }} />
        <ActivityIndicator color={theme.text} style={styles.loader} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: '', ...themedHeader }} />
        <ThemedText muted style={styles.loader}>Community not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: '', ...themedHeader }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={theme.text}
          />
        }
      >
        {/* Cover Image */}
        {community.image_url ? (
          <View style={styles.coverContainer}>
            <Image source={{ uri: community.image_url }} style={styles.coverImage} resizeMode="cover" />
            <View style={[styles.coverOverlay, { backgroundColor: theme.background }]} />
          </View>
        ) : (
          <View style={[styles.coverPlaceholder, { backgroundColor: theme.backgroundElement }]}>
            <ImageIcon size={40} color={theme.textSecondary} strokeWidth={1.5} />
          </View>
        )}

        {/* Group Info Header */}
        <View style={styles.groupHeader}>
          <View style={[styles.groupAvatar, { backgroundColor: theme.textSecondary }]}>
            <ThemedText style={styles.groupAvatarText}>
              {community.name.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText variant="heading" style={styles.groupName}>
            {community.name}
          </ThemedText>
          <ThemedText variant="caption" muted>
            {SPORT_LABELS[community.sport] || community.sport} &bull; {community.member_count ?? 0} member{(community.member_count ?? 0) !== 1 ? 's' : ''}
          </ThemedText>
        </View>

        {/* Badge Row */}
        <View style={styles.badgeRow}>
          {/* <View style={[styles.badge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <Swords size={14} color={theme.text} strokeWidth={2} />
            <ThemedText variant="caption" style={styles.badgeText}>
              {SPORT_LABELS[community.sport] || community.sport}
            </ThemedText>
          </View> */}
          <View
            style={[
              styles.badge,
              {
                backgroundColor: community.visibility === 'public' ? `${theme.success}1A` : `${theme.warning}1A`,
                borderColor: community.visibility === 'public' ? `${theme.success}40` : `${theme.warning}40`,
              },
            ]}
          >
            {community.visibility === 'public' ? (
              <Globe size={14} color={theme.success} strokeWidth={2} />
            ) : (
              <Lock size={14} color={theme.warning} strokeWidth={2} />
            )}
            <ThemedText
              variant="caption"
              style={[
                styles.badgeText,
                { color: community.visibility === 'public' ? theme.success : theme.warning },
              ]}
            >
              {community.visibility === 'public' ? 'Public' : 'Restricted'}
            </ThemedText>
          </View>
        </View>

        {/* Description + Creator */}
        <Card style={styles.sectionCard}>
          <ThemedText variant="body" style={styles.descriptionText}>
            {community.description || 'No description provided.'}
          </ThemedText>
          <View style={styles.detailRows}>
            {(community.organization || community.location) && (
              <View style={styles.detailRow}>
                {community.organization && (
                  <View style={styles.detailItem}>
                    <Building2 size={14} color={theme.textSecondary} strokeWidth={2} />
                    <ThemedText variant="caption" muted numberOfLines={1} style={styles.detailValue}>
                      {community.organization}
                    </ThemedText>
                  </View>
                )}
                {community.location && (
                  <View style={styles.detailItem}>
                    <MapPin size={14} color={theme.textSecondary} strokeWidth={2} />
                    <ThemedText variant="caption" muted numberOfLines={1} style={styles.detailValue}>
                      {community.location}
                    </ThemedText>
                  </View>
                )}
              </View>
            )}
            <View style={styles.creatorRow}>
              <User size={14} color={theme.textSecondary} strokeWidth={2} />
              <ThemedText variant="caption" muted>
                Created by {creator?.username || '...'}
              </ThemedText>
            </View>
          </View>
        </Card>

        {/* Members Section */}
        <View style={styles.sectionHeaderRow}>
          <ThemedText variant="label" muted style={styles.sectionLabel}>
            {sortedMembers.length} Member{sortedMembers.length !== 1 ? 's' : ''}
          </ThemedText>
          {(hasMoreMembers || isAdmin) && (
            <Pressable onPress={() => router.navigate(`/community/${id}/members`)} style={({ pressed }) => pressed && { opacity: 0.6 }} hitSlop={8}>
              <ThemedText variant="caption" style={{ color: theme.info, fontWeight: '600' }}>
                {isAdmin ? 'View All Members' : 'View All'}
              </ThemedText>
            </Pressable>
          )}
        </View>

        {membersLoading ? (
          <ActivityIndicator color={theme.textSecondary} style={{ paddingVertical: Spacing.md }} />
        ) : (
          <Card style={styles.membersCard}>
            {displayMembers.map((member) => (
              <Pressable
                key={member.profile_id}
                onPress={() =>
                  router.push({
                    pathname: '/profile/[id]',
                    params: { id: member.profile_id, community: id },
                  })
                }
                style={({ pressed }) => [styles.memberRow, { borderBottomColor: theme.border }, pressed && { opacity: 0.7 }]}
                hitSlop={8}
                onLongPress={() => {
                  if (isAdmin && member.profile_id !== user?.id) {
                    alert(
                      member.profile?.username || 'Member',
                      undefined,
                      [
                        {
                          text: 'Make Admin',
                          onPress: () => handleMakeAdmin(member),
                        },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: () => handleRemove(member),
                        },
                        { text: 'Cancel', style: 'cancel' },
                      ],
                    );
                  }
                }}
              >
                <UserAvatar avatarUrl={member.profile?.avatar_url} size={40} />
                <View style={styles.memberInfo}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {member.profile_id === user?.id
                      ? 'You'
                      : member.profile?.username ?? member.profile_id.slice(0, 8)}
                  </ThemedText>
                  {member.profile?.display_name && (
                    <ThemedText variant="caption" muted numberOfLines={1}>
                      {member.profile.display_name}
                    </ThemedText>
                  )}
                </View>
                {member.role === 'admin' && (
                  <View style={[styles.adminBadge, { backgroundColor: `${theme.warning}20` }]}>
                    <ThemedText variant="caption" style={{ color: theme.warning, fontWeight: '700', fontSize: 11 }}>
                      Admin
                    </ThemedText>
                  </View>
                )}
              </Pressable>
            ))}
            {(hasMoreMembers || isAdmin) && (
              <Pressable
                onPress={() => router.navigate(`/community/${id}/members`)}
                style={styles.viewAllRow}
              >
                <ThemedText variant="body" style={{ color: theme.info, fontWeight: '600' }}>
                  View All Members
                </ThemedText>
                <ChevronRight size={16} color={theme.info} strokeWidth={2} />
              </Pressable>
            )}
          </Card>
        )}

        {/* Non-member: Join */}
        {!isMember && (
          <View style={styles.actionSection}>
            <Button
              label={myPendingInvite ? 'Invitation Pending' : myJoinRequest ? 'Request Pending' : isRestricted ? 'Request to Join' : 'Join Community'}
              icon={
                myPendingInvite || myJoinRequest ? (
                  <Clock size={18} color={theme.background} strokeWidth={2.5} />
                ) : (
                  <Plus size={18} color={theme.background} strokeWidth={2.5} />
                )
              }
              onPress={handleJoin}
              disabled={!!myPendingInvite || !!myJoinRequest}
              buttonStyle={styles.actionButton}
            />
          </View>
        )}

        {/* Member: Edit + Leave */}
        {isMember && (
          <View style={styles.actionSection}>
            {isAdmin && (
              <>
                <View
                  style={[
                    styles.settingRow,
                    { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <Megaphone size={20} color={theme.text} strokeWidth={2} />
                  <View style={styles.pingsToggleInfo}>
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>
                      Allow Members to Ping
                    </ThemedText>
                    <ThemedText variant="caption" muted>
                      {pingsEnabled
                        ? 'Members can ping the whole community'
                        : 'Pings are disabled for members'}
                    </ThemedText>
                  </View>
                  <Switch
                    value={pingsEnabled}
                    onValueChange={handleTogglePings}
                    trackColor={{ false: theme.border, true: theme.success }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor={theme.border}
                  />
                </View>
                <Pressable
                  style={({ pressed }) => [styles.settingRow, { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}
                  onPress={() => router.push(`/community/${id}/edit`)}
                  hitSlop={8}
                >
                  <Pencil size={20} color={theme.text} strokeWidth={2} />
                  <ThemedText variant="body" style={{ fontWeight: '600', flex: 1 }}>
                    Edit Community
                  </ThemedText>
                  <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.settingRow, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}
                  onPress={handleDelete}
                  hitSlop={8}
                >
                  <Trash2 size={20} color={theme.error} strokeWidth={2} />
                  <ThemedText variant="body" style={{ fontWeight: '600', flex: 1, color: theme.error }}>
                    Delete Community
                  </ThemedText>
                </Pressable>
              </>
            )}
            {!isAdmin && (
              <Pressable
                style={({ pressed }) => [styles.settingRow, { backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}
                onPress={handleLeave}
                hitSlop={8}
              >
                <LogOut size={20} color={theme.error} strokeWidth={2} />
                <ThemedText variant="body" style={{ fontWeight: '600', flex: 1, color: theme.error }}>
                  Leave Community
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    paddingBottom: Spacing.xxxl,
  },

  // Cover
  coverContainer: {
    height: 160,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 160,
  },
  coverOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  coverPlaceholder: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Group Header
  groupHeader: {
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    marginTop: -32,
  },
  groupAvatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  groupAvatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
  },
  groupName: {
    fontWeight: '800',
    textAlign: 'center',
    marginTop: Spacing.xs,
  },

  // Badge Row
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 12,
  },

  // Description Card
  sectionCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.md,
    padding: Spacing.md,
  },
  descriptionText: {
    lineHeight: 22,
  },
  detailRows: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    maxWidth: '70%',
  },
  detailValue: {
    flexShrink: 1,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },

  // Members Section
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  sectionLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
  },
  membersCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    gap: 0,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  memberInfo: {
    flex: 1,
    gap: 2,
  },
  adminBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },

  // Action Section
  actionSection: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  actionButton: {
    width: '100%',
  },

  // Setting Rows
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pingsToggleInfo: {
    flex: 1,
    gap: 2,
  },
});
