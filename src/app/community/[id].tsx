import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import {
  Check,
  ChevronRight,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  Shield,
  Swords,
  Users,
  X,
} from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/useCommunity';
import {
  recordCommunityMatch,
  joinCommunity,
  leaveCommunity,
  requestToJoinCommunity,
  respondToJoinRequest,
  sendPing,
  transferAdmin,
  updateCommunity,
} from '@/services/communities';
import type {
  CommunityJoinRequest,
  CommunityMember,
  CommunityVisibility,
} from '@/types';

export default function CommunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const {
    community,
    membership,
    joinRequests,
    loading,
    refresh,
    setMembership,
    setJoinRequests,
  } = useCommunity(id ?? '', user?.id);

  const isAdmin = membership?.role === 'admin';
  const isMember = !!membership;

  // Ping modal
  const [pingModalVisible, setPingModalVisible] = useState(false);
  const [pingMessage, setPingMessage] = useState('');
  const [sendingPing, setSendingPing] = useState(false);

  // Record match
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [recordOpponentId, setRecordOpponentId] = useState<string | null>(null);
  const [recordPlayerScore, setRecordPlayerScore] = useState('0');
  const [recordOpponentScore, setRecordOpponentScore] = useState('0');
  const [recordingMatch, setRecordingMatch] = useState(false);

  // Edit modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editVisibility, setEditVisibility] = useState<CommunityVisibility>('public');
  const [savingEdit, setSavingEdit] = useState(false);

  const handleJoin = async () => {
    if (!id || !user) return;
    try {
      if (community?.visibility === 'restricted') {
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
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to leave.');
            }
          },
        },
      ],
    );
  };

  const handleOpenEdit = () => {
    if (!community) return;
    setEditName(community.name);
    setEditDescription(community.description ?? '');
    setEditVisibility(community.visibility);
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!id || !editName.trim()) return;
    setSavingEdit(true);
    try {
      await updateCommunity(id, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        visibility: editVisibility,
      });
      setEditModalVisible(false);
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to update.');
    } finally {
      setSavingEdit(false);
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
            setMembership((prev) => prev ? { ...prev, role: 'member' } : null);
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

  const handleRespondToRequest = async (
    request: CommunityJoinRequest,
    status: 'approved' | 'rejected',
  ) => {
    try {
      await respondToJoinRequest(request.id, status);
      setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
      if (status === 'approved') refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to respond.');
    }
  };

  const handleSendPing = async () => {
    if (!id || !user || !pingMessage.trim()) return;
    setSendingPing(true);
    try {
      await sendPing(id, user.id, pingMessage.trim());
      setPingMessage('');
      setPingModalVisible(false);
      Alert.alert('Ping Sent', 'Notification sent to all members.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to send ping.');
    } finally {
      setSendingPing(false);
    }
  };

  const handleRecordMatch = async () => {
    if (!id || !user || !recordOpponentId) return;
    const pScore = parseInt(recordPlayerScore, 10);
    const oScore = parseInt(recordOpponentScore, 10);
    if (isNaN(pScore) || isNaN(oScore)) {
      Alert.alert('Invalid Score', 'Please enter valid numbers.');
      return;
    }
    setRecordingMatch(true);
    try {
      await recordCommunityMatch({
        community_id: id,
        recorded_by: user.id,
        player_id: user.id,
        opponent_id: recordOpponentId,
        player_score: pScore,
        opponent_score: oScore,
      });
      setRecordModalVisible(false);
      setRecordOpponentId(null);
      setRecordPlayerScore('0');
      setRecordOpponentScore('0');
      Alert.alert('Match Recorded', 'Waiting for opponent approval.');
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to record match.');
    } finally {
      setRecordingMatch(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Community' }} />
        <ActivityIndicator color={theme.text} style={styles.loader} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Community' }} />
        <ThemedText muted style={styles.loader}>Community not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: community.name }} />
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
        {/* Community info card */}
        <Card style={styles.infoCard}>
          <View style={styles.infoHeader}>
            <ThemedText variant="heading" style={{ flex: 1 }}>
              {community.name}
            </ThemedText>
            <View
              style={[
                styles.visibilityBadge,
                {
                  backgroundColor:
                    community.visibility === 'public' ? '#10B98120' : '#D9770620',
                },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{
                  color: community.visibility === 'public' ? '#10B981' : '#D97706',
                  fontWeight: '700',
                }}
              >
                {community.visibility === 'public' ? 'Public' : 'Restricted'}
              </ThemedText>
            </View>
          </View>

          {community.description && (
            <ThemedText variant="body" muted style={styles.description}>
              {community.description}
            </ThemedText>
          )}

          <View style={styles.metaRow}>
            <Users size={14} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText variant="caption" muted>
              {community.member_count ?? 0} member{(community.member_count ?? 0) !== 1 ? 's' : ''}
            </ThemedText>
          </View>
        </Card>

        {/* Admin actions */}
        {isAdmin && (
          <View style={styles.adminActions}>
            <Pressable onPress={handleOpenEdit} style={styles.adminChip}>
              <Pencil size={14} color={theme.text} strokeWidth={2} />
              <ThemedText variant="caption" style={{ fontWeight: '600' }}>Edit</ThemedText>
            </Pressable>
            <Pressable onPress={handleTransferAdmin} style={styles.adminChip}>
              <Shield size={14} color={theme.text} strokeWidth={2} />
              <ThemedText variant="caption" style={{ fontWeight: '600' }}>Transfer Admin</ThemedText>
            </Pressable>
          </View>
        )}

        {/* Join requests — admin only */}
        {isAdmin && joinRequests.length > 0 && (
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionTitle}>
              Join Requests ({joinRequests.length})
            </ThemedText>
            {joinRequests.map((req) => (
              <Card key={req.id} style={styles.requestCard}>
                <View style={styles.requestInfo}>
                  <View style={[styles.avatar, { backgroundColor: theme.textSecondary }]}>
                    <ThemedText style={[styles.avatarText, { color: theme.background }]}>
                      {(req.profile?.username ?? '?').charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {req.profile?.username ?? 'Unknown'}
                  </ThemedText>
                </View>
                <View style={styles.requestActions}>
                  <Pressable
                    onPress={() => handleRespondToRequest(req, 'approved')}
                    style={[styles.actionChip, { backgroundColor: '#10B98120', borderColor: '#10B98140' }]}
                  >
                    <Check size={14} color="#10B981" strokeWidth={3} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleRespondToRequest(req, 'rejected')}
                    style={[styles.actionChip, { backgroundColor: '#EF444420', borderColor: '#EF444440' }]}
                  >
                    <X size={14} color="#EF4444" strokeWidth={3} />
                  </Pressable>
                </View>
              </Card>
            ))}
          </View>
        )}

        {/* Ping & Record Match — visible to members */}
        {isMember && (
          <>
            {isAdmin && (
              <Button
                label="Ping Everyone"
                variant="secondary"
                icon={<Megaphone size={16} color={theme.text} strokeWidth={2} />}
                onPress={() => setPingModalVisible(true)}
                buttonStyle={styles.fullWidthBtn}
              />
            )}
            <Button
              label="Record Match"
              variant="secondary"
              icon={<Swords size={16} color={theme.text} strokeWidth={2} />}
              onPress={() => setRecordModalVisible(true)}
              buttonStyle={styles.fullWidthBtn}
            />
          </>
        )}

        {/* Members — summary with navigation */}
        <Pressable
          onPress={() => router.navigate(`/community/${id}/members`)}
          style={[styles.membersSummaryCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <View style={styles.membersSummaryLeft}>
            <Users size={18} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText variant="body" style={{ fontWeight: '600' }}>
              {community.member_count ?? 0} Member{(community.member_count ?? 0) !== 1 ? 's' : ''}
            </ThemedText>
          </View>
          <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>

        {/* Match History — summary with navigation */}
        <Pressable
          onPress={() => router.navigate(`/community/${id}/matches`)}
          style={[styles.membersSummaryCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <View style={styles.membersSummaryLeft}>
            <Swords size={18} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText variant="body" style={{ fontWeight: '600' }}>
              Match History
            </ThemedText>
          </View>
          <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>

        {/* Join/Leave actions */}
        <View style={styles.actionBar}>
          {isMember ? (
            <Button
              label="Leave Community"
              variant="secondary"
              icon={<LogOut size={16} color={theme.text} strokeWidth={2} />}
              onPress={handleLeave}
              buttonStyle={styles.fullWidthBtn}
            />
          ) : (
            <Button
              label={community.visibility === 'restricted' ? 'Request to Join' : 'Join Community'}
              icon={<Plus size={16} color={theme.background} strokeWidth={2.5} />}
              onPress={handleJoin}
              buttonStyle={styles.fullWidthBtn}
            />
          )}
        </View>
      </ScrollView>

      {/* Ping Modal */}
      <Modal transparent visible={pingModalVisible} animationType="fade" onRequestClose={() => setPingModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPingModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <ThemedText variant="heading">Ping Everyone</ThemedText>
              <Pressable onPress={() => setPingModalVisible(false)} hitSlop={16}>
                <X size={18} color={theme.text} strokeWidth={2.5} />
              </Pressable>
            </View>
            <TextInput
              placeholder="What's up? (e.g. Playing tennis now!)"
              placeholderTextColor={theme.textSecondary}
              value={pingMessage}
              onChangeText={setPingMessage}
              style={[
                styles.pingInput,
                {
                  color: theme.text,
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
              multiline
              maxLength={200}
            />
            <Button
              label="Send Ping"
              onPress={handleSendPing}
              loading={sendingPing}
              disabled={!pingMessage.trim()}
            />
          </Pressable>
        </Pressable>
      </Modal>

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
              loading={savingEdit}
              disabled={!editName.trim()}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Record Match Modal */}
      <Modal transparent visible={recordModalVisible} animationType="fade" onRequestClose={() => setRecordModalVisible(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRecordModalVisible(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.modalHeader}>
              <ThemedText variant="heading">Record Match</ThemedText>
              <Pressable onPress={() => setRecordModalVisible(false)} hitSlop={16}>
                <X size={18} color={theme.text} strokeWidth={2.5} />
              </Pressable>
            </View>

            <ThemedText variant="label" muted>Opponent</ThemedText>
            <OpponentPicker
              communityId={id!}
              currentUserId={user?.id}
              selectedId={recordOpponentId}
              onSelect={setRecordOpponentId}
            />

            <View style={styles.scoreRow}>
              <View style={{ flex: 1 }}>
                <ThemedText variant="label" muted style={{ marginBottom: Spacing.xs }}>Your Score</ThemedText>
                <TextInput
                  value={recordPlayerScore}
                  onChangeText={setRecordPlayerScore}
                  keyboardType="number-pad"
                  style={[
                    styles.scoreInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                />
              </View>
              <ThemedText variant="heading" style={{ marginTop: Spacing.lg }}>:</ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText variant="label" muted style={{ marginBottom: Spacing.xs }}>Opponent Score</ThemedText>
                <TextInput
                  value={recordOpponentScore}
                  onChangeText={setRecordOpponentScore}
                  keyboardType="number-pad"
                  style={[
                    styles.scoreInput,
                    { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                />
              </View>
            </View>

            <Button
              label="Submit Match"
              onPress={handleRecordMatch}
              loading={recordingMatch}
              disabled={!recordOpponentId}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function OpponentPicker({
  communityId,
  currentUserId,
  selectedId,
  onSelect,
}: {
  communityId: string;
  currentUserId?: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { fetchCommunityMembers } = await import('@/services/communities');
        const data = await fetchCommunityMembers(communityId);
        if (!cancelled) setMembers(data.filter((m) => m.profile_id !== currentUserId));
      } catch (e) {
        console.error('Failed to load members:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [communityId, currentUserId]);

  if (loading) return <ActivityIndicator color={theme.text} style={styles.smallLoader} />;

  return (
    <View style={styles.opponentList}>
      {members.map((member) => (
        <Pressable
          key={member.profile_id}
          onPress={() => onSelect(member.profile_id)}
          style={[
            styles.opponentOption,
            {
              backgroundColor: selectedId === member.profile_id ? theme.textSecondary + '20' : theme.backgroundElement,
              borderColor: selectedId === member.profile_id ? theme.textSecondary : theme.border,
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: theme.textSecondary }]}>
            <ThemedText style={[styles.avatarText, { color: theme.background }]}>
              {member.profile_id.charAt(0).toUpperCase()}
            </ThemedText>
          </View>
          <ThemedText variant="body" style={{ fontWeight: '600', flex: 1 }}>
            {member.profile_id.slice(0, 8)}
          </ThemedText>
          {selectedId === member.profile_id && (
            <Check size={16} color="#10B981" strokeWidth={3} />
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  infoCard: { gap: Spacing.sm },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  visibilityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  description: { marginTop: Spacing.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  adminActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  adminChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#2A2A2A40',
  },
  section: { gap: Spacing.sm },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  requestInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  requestActions: { flexDirection: 'row', gap: Spacing.xs },
  actionChip: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  membersList: { gap: Spacing.sm },
  membersSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  membersSummaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  memberDetails: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  roleBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  pingSection: { gap: Spacing.sm },
  pingBtn: { marginTop: Spacing.xs },
  pingsList: { gap: Spacing.sm },
  pingCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  actionBar: { marginTop: Spacing.md },
  fullWidthBtn: { width: '100%' },
  smallLoader: { paddingVertical: Spacing.md },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  scoreInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  opponentList: { gap: Spacing.sm, maxHeight: 200 },
  opponentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  matchCard: { gap: Spacing.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  matchDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  matchActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
  },

  // Modal styles
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
  pingInput: {
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
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
});
