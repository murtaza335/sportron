import { Check, Clock, MapPin, MessageCircle, Users, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { SessionChatPopup } from '@/components/SessionChatPopup';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  approveCommitment,
  checkTimeConflicts,
  commitToSession,
  deleteSession,
  fetchSessionById,
  fetchSessionCommitments,
  rejectCommitment,
  uncommitFromSession,
} from '@/services/sessions';
import type { Commitment, Session } from '@/types';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type SessionDetailPopupProps = {
  sessionId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  initialSession?: Partial<Session> | null;
  onRefreshFeed?: () => void;
};

function formatSessionDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatSessionTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionDetailPopup({
  sessionId,
  visible,
  onClose,
  currentUserId,
  initialSession,
  onRefreshFeed,
}: SessionDetailPopupProps) {
  const theme = useTheme();
  const [translateY] = useState(() => new Animated.Value(SCREEN_HEIGHT));

  const [session, setSession] = useState<Session | null>(() => initialSession as Session | null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [joining, setJoining] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [myCommitmentStatus, setMyCommitmentStatus] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadedSessionId, setLoadedSessionId] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const isLoading = visible && sessionId !== null && loadedSessionId !== sessionId;
  const isCreator = currentUserId && (session?.created_by ?? (initialSession as Session | null)?.created_by) === currentUserId;

  // Drag-to-dismiss
  const panResponder = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const [panHandlers, setPanHandlers] =
    useState<ReturnType<typeof PanResponder.create>['panHandlers'] | null>(null);

  useEffect(() => {
    if (!panResponder.current) {
      panResponder.current = PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gs) => gs.dy > 8,
        onPanResponderMove: (_, gs) => {
          if (gs.dy > 0) translateY.setValue(gs.dy);
        },
        onPanResponderRelease: (_, gs) => {
          if (gs.dy > 120 || gs.vy > 0.4) {
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 220,
              useNativeDriver: true,
            }).start(onClose);
          } else {
            Animated.spring(translateY, {
              toValue: 0,
              tension: 50,
              friction: 8,
              useNativeDriver: true,
            }).start();
          }
        },
      });
      setPanHandlers(panResponder.current.panHandlers);
    }
  }, [translateY, onClose]);

  // Load session data when popup opens
  useEffect(() => {
    if (!visible || !sessionId) return;
    const id = sessionId;
    fetchSessionById(id, currentUserId)
      .then((data) => {
        if (sessionId === id) {
          setSession(data);
          setMyCommitmentStatus(data?.my_commitment?.status ?? null);
          setLoadedSessionId(id);
        }
      })
      .catch((e) => console.error('Failed to load session:', e));
  }, [visible, sessionId, currentUserId]);

  // Load applicant list when session loads and user is creator
  useEffect(() => {
    if (!visible || !sessionId || !isCreator) return;
    fetchSessionCommitments(sessionId)
      .then(setCommitments)
      .catch((e) => console.error('Failed to load commitments:', e));
  }, [visible, sessionId, isCreator]);

  // Reload commitments after approve/reject
  useEffect(() => {
    if (!isCreator || !sessionId) return;
    fetchSessionCommitments(sessionId)
      .then(setCommitments)
      .catch((e) => console.error('Failed to load commitments:', e));
  }, [reloadKey, isCreator, sessionId]);

  // Animate sheet
  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      }).start();
    } else {
      translateY.setValue(SCREEN_HEIGHT);
    }
  }, [visible, translateY]);

  const handleCommit = async () => {
    if (!currentUserId || !sessionId) return;
    setJoining(true);
    try {
      const conflicts = await checkTimeConflicts(currentUserId, session!.date_time);
      const otherConflicts = conflicts.filter((c) => c.id !== sessionId);
      if (otherConflicts.length > 0) {
        Alert.alert(
          'Time Conflict',
          `You have a conflicting session within ±30 minutes:\n\n${otherConflicts
            .map((c) => `• ${c.purpose} at ${new Date(c.date_time).toLocaleString()}`)
            .join('\n')}`,
        );
        return;
      }
      await commitToSession(sessionId, currentUserId);
      setMyCommitmentStatus('pending');
      onRefreshFeed?.();
    } catch (e: any) {
      Alert.alert('Cannot Join', e?.message ?? 'Failed to join session.');
      console.error('Commit error:', e);
    } finally {
      setJoining(false);
    }
  };

  const handleUncommit = async () => {
    if (!currentUserId || !sessionId) return;
    setJoining(true);
    try {
      await uncommitFromSession(sessionId, currentUserId);
      setMyCommitmentStatus('left');
      onRefreshFeed?.();
    } catch (e) {
      Alert.alert('Error', 'Failed to leave session.');
      console.error('Uncommit error:', e);
    } finally {
      setJoining(false);
    }
  };

  const handleApprove = async (commitmentId: string) => {
    const id = sessionId;
    const uid = currentUserId;
    if (!id || !uid) return;
    setApprovingId(commitmentId);
    try {
      await approveCommitment(commitmentId, uid);
      setReloadKey((k) => k + 1);
      const sessionData = await fetchSessionById(id, uid);
      setSession(sessionData);
      setMyCommitmentStatus(sessionData?.my_commitment?.status ?? null);
      onRefreshFeed?.();
    } catch (e: any) {
      Alert.alert('Cannot Approve', e?.message ?? 'Failed to approve applicant.');
      console.error('Approve error:', e);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (commitmentId: string) => {
    const uid = currentUserId;
    if (!uid) return;
    setApprovingId(commitmentId);
    try {
      await rejectCommitment(commitmentId, uid);
      setReloadKey((k) => k + 1);
      onRefreshFeed?.();
    } catch (e) {
      Alert.alert('Error', 'Failed to reject applicant.');
      console.error('Reject error:', e);
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = () => {
    if (!sessionId || !currentUserId) return;
    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteSession(sessionId, currentUserId);
              onRefreshFeed?.();
              onClose();
            } catch (e: any) {
              Alert.alert('Cannot Delete', e?.message ?? 'An error occurred.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (!visible) return null;

  const pendingCommitments = commitments.filter((c) => c.status === 'pending');
  const acceptedCommitments = commitments.filter((c) => c.status === 'accepted');
  const rejectedCommitments = commitments.filter((c) => c.status === 'rejected');
  const leftCommitments = commitments.filter((c) => c.status === 'left');
  const hasAcceptedParticipants = acceptedCommitments.length > 0;

  const maxParticipants = session?.max_participants ?? initialSession?.max_participants;
  const commitmentCount = session?.commitment_count ?? acceptedCommitments.length;
  const isSessionFull =
    session?.status === 'full' ||
    (maxParticipants != null && commitmentCount >= maxParticipants);

  const canViewChat = !!(
    sessionId &&
    currentUserId &&
    (isCreator || myCommitmentStatus === 'accepted' || myCommitmentStatus === 'left')
  );
  const sessionStatus = session?.status ?? initialSession?.status;
  const canSendChat =
    canViewChat &&
    (isCreator || myCommitmentStatus === 'accepted') &&
    (!sessionStatus || sessionStatus === 'open' || sessionStatus === 'full');

  return (
    <>
      <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                borderColor: theme.border,
                transform: [{ translateY }],
              },
            ]}
          >
          <View style={styles.handleContainer} {...panHandlers}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
          </View>

          <View style={styles.header} {...panHandlers}>
            <ThemedText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
              {session?.title ??
                session?.purpose ??
                initialSession?.title ??
                initialSession?.purpose ??
                'Session'}
            </ThemedText>
            <View style={styles.headerActions}>
              {canViewChat && (
                <Pressable
                  onPress={() => setChatVisible(true)}
                  hitSlop={16}
                  style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}
                >
                  <MessageCircle size={18} color={theme.text} strokeWidth={2.5} />
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={16}
                style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}
              >
                <X size={18} color={theme.text} strokeWidth={2.5} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Card style={styles.infoCard}>
              <View style={styles.infoRow}>
                <MapPin size={16} color={theme.textSecondary} />
                <ThemedText variant="body" style={styles.infoValue}>
                  {session?.location ?? initialSession?.location}
                </ThemedText>
              </View>

              <View style={styles.infoRow}>
                <Clock size={16} color={theme.textSecondary} />
                <ThemedText variant="body" style={styles.infoValue}>
                  {formatSessionDate(session?.date_time ?? initialSession?.date_time ?? '')} at{' '}
                  {formatSessionTime(session?.date_time ?? initialSession?.date_time ?? '')}
                </ThemedText>
              </View>

              <View style={styles.infoRow}>
                <Users size={16} color={theme.textSecondary} />
                <ThemedText variant="body" style={styles.infoValue}>
                  {session?.commitment_count ?? 0} / {session?.max_participants ?? initialSession?.max_participants} participants
                </ThemedText>
              </View>
            </Card>

            {(session?.description ?? initialSession?.description) ? (
              <ThemedText variant="body" muted style={styles.description}>
                {session?.description ?? initialSession?.description}
              </ThemedText>
            ) : null}

            <View style={styles.creatorRow}>
              <UserAvatar
                avatarUrl={session?.creator?.avatar_url ?? initialSession?.creator?.avatar_url}
                size={40}
              />
              <View>
                <ThemedText variant="caption" muted>
                  Posted by
                </ThemedText>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {session?.creator?.username ?? initialSession?.creator?.username ?? 'Unknown'}
                </ThemedText>
              </View>
            </View>

            {isLoading ? (
              <ActivityIndicator color={theme.text} style={styles.dynamicLoader} />
            ) : (
              <>
                {/* Applicants section — visible to creator */}
                {isCreator && (
                  <View style={styles.applicantsSection}>
                    <ThemedText variant="label" muted style={styles.sectionTitle}>
                      Applicants
                    </ThemedText>

                    {pendingCommitments.length === 0 && acceptedCommitments.length === 0 && leftCommitments.length === 0 && rejectedCommitments.length === 0 ? (
                      <ThemedText variant="caption" muted style={styles.emptyApplicants}>
                        No one has applied yet.
                      </ThemedText>
                    ) : (
                      <>
                        {/* Pending — needs approval */}
                        {pendingCommitments.map((c) => (
                          <View
                            key={c.id}
                            style={[
                              styles.applicantCard,
                              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                            ]}
                          >
                            <View style={styles.applicantInfo}>
                              <UserAvatar avatarUrl={c.profile?.avatar_url} size={36} />
                              <View style={styles.applicantDetails}>
                                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                                  {c.profile?.username ?? 'Unknown'}
                                </ThemedText>
                                <ThemedText variant="caption" muted>
                                  {c.profile?.completed_sessions ?? 0} /{' '}
                                  {c.profile?.total_committed_sessions ?? 0} sessions completed
                                </ThemedText>
                              </View>
                            </View>
                            <View style={styles.applicantActions}>
                              {approvingId === c.id ? (
                                <ActivityIndicator size="small" color={theme.textSecondary} style={styles.actionLoading} />
                              ) : (
                                <>
                                  <Pressable
                                    onPress={() => handleApprove(c.id)}
                                    disabled={approvingId === c.id}
                                    style={[
                                      styles.actionChip,
                                      { backgroundColor: '#10B98120', borderColor: '#10B98140' },
                                    ]}
                                  >
                                    <Check size={14} color="#10B981" strokeWidth={3} />
                                  </Pressable>
                                  <Pressable
                                    onPress={() => handleReject(c.id)}
                                    disabled={approvingId === c.id}
                                    style={[
                                      styles.actionChip,
                                      { backgroundColor: '#EF444420', borderColor: '#EF444440' },
                                    ]}
                                  >
                                    <X size={14} color="#EF4444" strokeWidth={3} />
                                  </Pressable>
                                </>
                              )}
                            </View>
                          </View>
                        ))}

                        {/* Accepted */}
                        {acceptedCommitments.map((c) => (
                          <View
                            key={c.id}
                            style={[
                              styles.applicantCard,
                              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                            ]}
                          >
                            <View style={styles.applicantInfo}>
                              <UserAvatar avatarUrl={c.profile?.avatar_url} size={36} />
                              <View style={styles.applicantDetails}>
                                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                                  {c.profile?.username ?? 'Unknown'}
                                </ThemedText>
                                <ThemedText variant="caption" muted>
                                  {c.profile?.completed_sessions ?? 0} /{' '}
                                  {c.profile?.total_committed_sessions ?? 0} sessions completed
                                </ThemedText>
                              </View>
                            </View>
                            <View style={[styles.statusChip, { backgroundColor: '#10B98120' }]}>
                              <ThemedText
                                variant="caption"
                                style={{ color: '#10B981', fontWeight: '700', fontSize: 10 }}
                              >
                                Approved
                              </ThemedText>
                            </View>
                          </View>
                        ))}

                        {/* Rejected */}
                        {rejectedCommitments.length > 0 && (
                          <>
                            <ThemedText variant="label" muted style={styles.sectionTitle}>
                              Declined
                            </ThemedText>
                            {rejectedCommitments.map((c) => (
                              <View
                                key={c.id}
                                style={[
                                  styles.applicantCard,
                                  {
                                    backgroundColor: theme.backgroundElement,
                                    borderColor: theme.border,
                                    opacity: 0.6,
                                  },
                                ]}
                              >
                                <View style={styles.applicantInfo}>
                                  <UserAvatar avatarUrl={c.profile?.avatar_url} size={36} />
                                  <View style={styles.applicantDetails}>
                                    <ThemedText variant="body" style={{ fontWeight: '600' }}>
                                      {c.profile?.username ?? 'Unknown'}
                                    </ThemedText>
                                    <ThemedText variant="caption" muted>
                                      {c.profile?.completed_sessions ?? 0} /{' '}
                                      {c.profile?.total_committed_sessions ?? 0} sessions completed
                                    </ThemedText>
                                  </View>
                                </View>
                                <View style={[styles.statusChip, { backgroundColor: '#EF444420' }]}>
                                  <ThemedText
                                    variant="caption"
                                    style={{
                                      color: '#EF4444',
                                      fontWeight: '700',
                                      fontSize: 10,
                                    }}
                                  >
                                    Declined
                                  </ThemedText>
                                </View>
                              </View>
                            ))}
                          </>
                        )}

                        {/* Left */}
                        {leftCommitments.length > 0 && (
                          <>
                            <ThemedText variant="label" muted style={styles.sectionTitle}>
                              Left ({leftCommitments.length})
                            </ThemedText>
                            {leftCommitments.map((c) => (
                              <View
                                key={c.id}
                                style={[
                                  styles.applicantCard,
                                  {
                                    backgroundColor: theme.backgroundElement,
                                    borderColor: theme.border,
                                    opacity: 0.5,
                                  },
                                ]}
                              >
                                <View style={styles.applicantInfo}>
                                  <UserAvatar avatarUrl={c.profile?.avatar_url} size={36} />
                                  <View style={styles.applicantDetails}>
                                    <ThemedText
                                      variant="body"
                                      style={{ fontWeight: '600', opacity: 0.6 }}
                                    >
                                      {c.profile?.username ?? 'Unknown'}
                                    </ThemedText>
                                    <ThemedText variant="caption" muted>
                                      {c.profile?.completed_sessions ?? 0} /{' '}
                                      {c.profile?.total_committed_sessions ?? 0} sessions completed
                                    </ThemedText>
                                  </View>
                                </View>
                                <View style={[styles.statusChip, { backgroundColor: '#A855F720' }]}>
                                  <ThemedText
                                    variant="caption"
                                    style={{
                                      color: '#A855F7',
                                      fontWeight: '700',
                                      fontSize: 10,
                                    }}
                                  >
                                    Left
                                  </ThemedText>
                                </View>
                              </View>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </View>
                )}

                {/* Delete — visible to creator */}
                {isCreator && (
                  <>
                    {hasAcceptedParticipants ? (
                      <View
                        style={[
                          styles.deleteBlockedBanner,
                          { backgroundColor: '#DC262610', borderColor: '#DC262625' },
                        ]}
                      >
                        <ThemedText
                          variant="caption"
                          style={{ color: '#DC2626', textAlign: 'center', fontWeight: '500' }}
                        >
                          Cannot delete — {acceptedCommitments.length} participant
                          {acceptedCommitments.length > 1 ? 's have' : ' has'} already been accepted
                        </ThemedText>
                      </View>
                    ) : (
                      <Pressable
                        onPress={handleDelete}
                        disabled={deleting}
                        style={styles.deleteAction}
                      >
                        <ThemedText
                          style={{ color: '#DC2626', fontWeight: '600', fontSize: 14 }}
                        >
                          {deleting ? 'Deleting...' : 'Delete Session'}
                        </ThemedText>
                      </Pressable>
                    )}
                  </>
                )}

                {/* Action section — visible to non-creators */}
                {!isCreator && currentUserId && (
                  <>
                    {myCommitmentStatus === 'accepted' && (
                      <Button
                        label="Leave Session"
                        variant="secondary"
                        onPress={handleUncommit}
                        loading={joining}
                        buttonStyle={styles.actionBtn}
                      />
                    )}
                    {myCommitmentStatus === 'pending' && (
                      <ThemedText
                        variant="caption"
                        muted
                        style={styles.statusMessage}
                      >
                        Your request is pending approval
                      </ThemedText>
                    )}
                    {myCommitmentStatus === 'left' && (
                      <View style={[styles.leftBanner, { backgroundColor: '#A855F715', borderColor: '#A855F730' }]}>
                        <ThemedText
                          variant="body"
                          style={{ color: '#A855F7', fontWeight: '600', textAlign: 'center' }}
                        >
                          You left this session
                        </ThemedText>
                      </View>
                    )}
                    {myCommitmentStatus === 'rejected' && (
                      <ThemedText
                        variant="caption"
                        muted
                        style={styles.statusMessage}
                      >
                        Your request was declined
                      </ThemedText>
                    )}
                    {!myCommitmentStatus && (
                      <>
                        {isSessionFull ? (
                          <View style={[styles.fullBanner, { backgroundColor: '#DC262610', borderColor: '#DC262625' }]}>
                            <ThemedText
                              variant="body"
                              style={{ color: '#DC2626', fontWeight: '600', textAlign: 'center' }}
                            >
                              Session is full
                            </ThemedText>
                          </View>
                        ) : (
                          <Button
                            label="Yes, I'm In!"
                            onPress={handleCommit}
                            loading={joining}
                            buttonStyle={styles.actionBtn}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      </View>
      </Modal>

      <SessionChatPopup
        sessionId={sessionId}
        visible={chatVisible}
        onClose={() => setChatVisible(false)}
        currentUserId={currentUserId}
        session={session ?? initialSession}
        canSend={canSendChat}
        hasLeft={myCommitmentStatus === 'left'}
      />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg + 10,
    maxHeight: '80%',
  },
  handleContainer: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: Radius.full,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    maxHeight: SCREEN_HEIGHT * 0.5,
  },
  scrollContent: {
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  infoCard: {
    gap: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  infoValue: {
    fontWeight: '600',
  },
  description: {
    lineHeight: 22,
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  actionBtn: {
    marginTop: Spacing.sm,
  },
  loadingContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
  },
  dynamicLoader: {
    paddingVertical: Spacing.xl,
  },
  applicantsSection: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
    marginTop: Spacing.xs,
  },
  emptyApplicants: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  applicantCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  applicantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  applicantDetails: {
    gap: 1,
    flex: 1,
  },
  applicantActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionLoading: {
    width: 64,
  },
  actionChip: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  statusChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  statusMessage: {
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  leftBanner: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  deleteAction: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  deleteBlockedBanner: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
  fullBanner: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
  },
});
