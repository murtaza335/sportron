import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { uploadImageFromUri } from '@/lib/cloudinary';
import {
  Building2,
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
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
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
  transferAdmin,
  updateCommunity,
} from '@/services/communities';
import { fetchProfile } from '@/services/profiles';
import type { CommunityMember, CommunityVisibility, Profile } from '@/types';
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

  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editOrganization, setEditOrganization] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editVisibility, setEditVisibility] = useState<CommunityVisibility>('public');
  const [editImageUri, setEditImageUri] = useState<string | null>(null);
  const [uploadingEditImage, setUploadingEditImage] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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
      Alert.alert('Error', e?.message ?? 'Failed to update ping settings.');
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

  const pickEditImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission required', 'Please grant permission to access your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEditImageUri(result.assets[0].uri);
    }
  };

  const removeEditImage = () => {
    setEditImageUri(null);
  };

  const handleSaveEdit = async () => {
    if (!id || !editName.trim()) return;
    setSavingEdit(true);
    try {
      let imageUrl: string | null | undefined = undefined;
      if (editImageUri !== (community?.image_url ?? null)) {
        if (editImageUri) {
          setUploadingEditImage(true);
          const uploaded = await uploadImageFromUri(editImageUri);
          if (!uploaded) {
            Alert.alert('Error', 'Failed to upload image.');
            setSavingEdit(false);
            setUploadingEditImage(false);
            return;
          }
          imageUrl = uploaded;
          setUploadingEditImage(false);
        } else {
          imageUrl = null;
        }
      }
      await updateCommunity(id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        organization: editOrganization.trim() || null,
        location: editLocation.trim() || null,
        visibility: editVisibility,
        image_url: imageUrl,
      });
      setEditModalVisible(false);
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update.');
    } finally {
      setSavingEdit(false);
      setUploadingEditImage(false);
    }
  };

  const handleTransferAdmin = () => {
    if (!id) return;
    if (Alert.prompt) {
      Alert.prompt(
        'Transfer Admin',
        'Enter the username of the new admin:',
        async (text) => {
          if (!text.trim()) return;
          try {
            await transferAdmin(id, user!.id, text.trim());
            setMembership(null);
            setEditModalVisible(false);
            refresh();
            Alert.alert('Done', 'Admin rights transferred.');
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Failed to transfer.');
          }
        },
      );
    } else {
      Alert.alert(
        'Transfer Admin',
        'Transfer admin by username: feature available on iOS.',
      );
    }
  };

  const handleJoin = async () => {
    if (!id || !user) return;
    try {
      if (isRestricted) {
        await requestToJoinCommunity(id, user.id);
        Alert.alert('Request Sent', 'The admin will review your request.');
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
      Alert.alert('Error', e?.message ?? 'Failed to join.');
    }
  };

  const handleLeave = () => {
    if (!id || !user) return;
    Alert.alert(
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
              Alert.alert('Error', e?.message ?? 'Failed to leave.');
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    if (!id) return;
    Alert.alert(
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
              Alert.alert('Error', e?.message ?? 'Failed to delete community.');
            }
          },
        },
      ],
    );
  };

  const handleEdit = () => {
    if (!community) return;
    setEditName(community.name);
    setEditDescription(community.description ?? '');
    setEditOrganization(community.organization ?? '');
    setEditLocation(community.location ?? '');
    setEditVisibility(community.visibility);
    setEditImageUri(community.image_url ?? null);
    setEditModalVisible(true);
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
      Alert.alert('Error', e?.message ?? 'Failed to promote member.');
    }
  };

  const handleRemove = (member: CommunityMember) => {
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

  const themedHeader = {
    headerStyle: { backgroundColor: theme.background },
    headerShadowVisible: false,
    headerTintColor: theme.text,
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
                backgroundColor: community.visibility === 'public' ? '#10B9811A' : '#D977061A',
                borderColor: community.visibility === 'public' ? '#10B98140' : '#D9770640',
              },
            ]}
          >
            {community.visibility === 'public' ? (
              <Globe size={14} color="#10B981" strokeWidth={2} />
            ) : (
              <Lock size={14} color="#D97706" strokeWidth={2} />
            )}
            <ThemedText
              variant="caption"
              style={[
                styles.badgeText,
                { color: community.visibility === 'public' ? '#10B981' : '#D97706' },
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
            <Pressable onPress={() => router.navigate(`/community/${id}/members`)}>
              <ThemedText variant="caption" style={{ color: '#3B82F6', fontWeight: '600' }}>
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
                onPress={() => router.push(`/profile/${member.profile_id}`)}
                onLongPress={() => {
                  if (isAdmin && member.profile_id !== user?.id) {
                    Alert.alert(
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
                style={[styles.memberRow, { borderBottomColor: theme.border }]}
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
                  <View style={[styles.adminBadge, { backgroundColor: '#D9770620' }]}>
                    <ThemedText variant="caption" style={{ color: '#D97706', fontWeight: '700', fontSize: 11 }}>
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
                <ThemedText variant="body" style={{ color: '#3B82F6', fontWeight: '600' }}>
                  View All Members
                </ThemedText>
                <ChevronRight size={16} color="#3B82F6" strokeWidth={2} />
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
                    trackColor={{ false: theme.border, true: '#10B981' }}
                    thumbColor="#FFFFFF"
                    ios_backgroundColor={theme.border}
                  />
                </View>
                <Pressable
                  style={[styles.settingRow, { borderBottomColor: theme.border, backgroundColor: theme.backgroundElement }]}
                  onPress={handleEdit}
                >
                  <Pencil size={20} color={theme.text} strokeWidth={2} />
                  <ThemedText variant="body" style={{ fontWeight: '600', flex: 1 }}>
                    Edit Community
                  </ThemedText>
                  <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
                </Pressable>
                <Pressable
                  style={[styles.settingRow, { backgroundColor: theme.backgroundElement }]}
                  onPress={handleDelete}
                >
                  <Trash2 size={20} color="#EF4444" strokeWidth={2} />
                  <ThemedText variant="body" style={{ fontWeight: '600', flex: 1, color: '#EF4444' }}>
                    Delete Community
                  </ThemedText>
                </Pressable>
              </>
            )}
            {!isAdmin && (
              <Pressable
                style={[styles.settingRow, { backgroundColor: theme.backgroundElement }]}
                onPress={handleLeave}
              >
                <LogOut size={20} color="#EF4444" strokeWidth={2} />
                <ThemedText variant="body" style={{ fontWeight: '600', flex: 1, color: '#EF4444' }}>
                  Leave Community
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>

      {/* Edit Modal */}
      <Modal transparent visible={editModalVisible} animationType="fade" onRequestClose={() => setEditModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <ThemedText variant="heading">Edit Community</ThemedText>
              <Pressable onPress={() => setEditModalVisible(false)} hitSlop={16}>
                <X size={18} color={theme.text} strokeWidth={2.5} />
              </Pressable>
            </View>

            <Pressable onPress={pickEditImage} style={[styles.editImagePicker, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              {editImageUri ? (
                <>
                  <Image source={{ uri: editImageUri }} style={[styles.editImagePreview, { backgroundColor: theme.border }]} resizeMode="cover" />
                  <Pressable onPress={removeEditImage} style={[styles.editImageRemove, { backgroundColor: theme.background }]} hitSlop={12}>
                    <X size={12} color={theme.text} strokeWidth={2.5} />
                  </Pressable>
                </>
              ) : (
                <View style={styles.editImagePlaceholder}>
                  <ImageIcon size={24} color={theme.textSecondary} strokeWidth={1.5} />
                  <ThemedText variant="caption" muted>Tap to add cover image</ThemedText>
                </View>
              )}
            </Pressable>
            
            <TextInput
              placeholder="Community name"
              placeholderTextColor={theme.textSecondary}
              value={editName}
              onChangeText={setEditName}
              style={[
                styles.editInput,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
              maxLength={60}
            />
            
            <TextInput
              placeholder="Description (optional)"
              placeholderTextColor={theme.textSecondary}
              value={editDescription}
              onChangeText={setEditDescription}
              style={[
                styles.editInput,
                styles.editInputMultiline,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
              multiline
              maxLength={300}
            />

            <TextInput
              placeholder="Organization (optional)"
              placeholderTextColor={theme.textSecondary}
              value={editOrganization}
              onChangeText={setEditOrganization}
              style={[
                styles.editInput,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
              maxLength={60}
            />

            <TextInput
              placeholder="Location / City (optional)"
              placeholderTextColor={theme.textSecondary}
              value={editLocation}
              onChangeText={setEditLocation}
              style={[
                styles.editInput,
                { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
              maxLength={60}
            />

            <View style={styles.visibilityToggle}>
              <Pressable
                onPress={() => setEditVisibility('public')}
                style={[
                  styles.visibilityOption,
                  {
                    backgroundColor: editVisibility === 'public' ? theme.textSecondary + '20' : 'transparent',
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText
                  variant="body"
                  style={editVisibility === 'public' ? { fontWeight: '700' } : { fontWeight: '400' }}
                >
                  Public
                </ThemedText>
              </Pressable>
              
              <Pressable
                onPress={() => setEditVisibility('restricted')}
                style={[
                  styles.visibilityOption,
                  {
                    backgroundColor: editVisibility === 'restricted' ? theme.textSecondary + '20' : 'transparent',
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText
                  variant="body"
                  style={editVisibility === 'restricted' ? { fontWeight: '700' } : { fontWeight: '400' }}
                >
                  Restricted
                </ThemedText>
              </Pressable>
            </View>
            
            <Button
              label="Save Changes"
              onPress={handleSaveEdit}
              loading={savingEdit || uploadingEditImage}
              disabled={!editName.trim() || uploadingEditImage}
            />

            <Pressable onPress={handleTransferAdmin} style={styles.transferAdminLink}>
               <Shield size={14} color="#EF4444" strokeWidth={2} />
               <ThemedText variant="caption" style={{ color: '#EF4444', fontWeight: '600' }}>
                 Transfer Admin Rights
               </ThemedText>
            </Pressable>

          </Pressable>
        </Pressable>
      </Modal>
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

  // Edit Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editImagePicker: {
    width: '100%',
    height: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImagePreview: {
    width: '100%',
    height: 120,
  },
  editImageRemove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  editInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
  },
  editInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  visibilityToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  visibilityOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  transferAdminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
  },
});
