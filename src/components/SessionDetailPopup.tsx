import { Check, Clock, MapPin, Users, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
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
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  approveCommitment,
  checkTimeConflicts,
  commitToSession,
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
  onRefreshFeed,
}: SessionDetailPopupProps) {
  const theme = useTheme();
  const [translateY] = useState(() => new Animated.Value(SCREEN_HEIGHT));

  const [session, setSession] = useState<Session | null>(null);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [joining, setJoining] = useState(false);
  const [myCommitmentStatus, setMyCommitmentStatus] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const loading = visible && session === null && sessionId !== null;
  const isCreator = currentUserId && session?.created_by === currentUserId;

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
            .map((c) => `• ${c.sport} at ${new Date(c.date_time).toLocaleString()}`)
            .join('\n')}`,
        );
        return;
      }
      await commitToSession(sessionId, currentUserId);
      setMyCommitmentStatus('pending');
      onRefreshFeed?.();
    } catch (e) {
      Alert.alert('Error', 'Failed to join session.');
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
    setApprovingId(commitmentId);
    try {
      await approveCommitment(commitmentId);
      setReloadKey((k) => k + 1);
      const sessionData = await fetchSessionById(sessionId, currentUserId);
      setSession(sessionData);
      setMyCommitmentStatus(sessionData?.my_commitment?.status ?? null);
      onRefreshFeed?.();
    } catch (e) {
      Alert.alert('Error', 'Failed to approve applicant.');
      console.error('Approve error:', e);
    } finally {
      setApprovingId(null);
    }
  };

  const handleReject = async (commitmentId: string) => {
    setApprovingId(commitmentId);
    try {
      await rejectCommitment(commitmentId);
      setReloadKey((k) => k + 1);
      onRefreshFeed?.();
    } catch (e) {
      Alert.alert('Error', 'Failed to reject applicant.');
      console.error('Reject error:', e);
    } finally {
      setApprovingId(null);
    }
  };

  if (!visible) return null;

  const pendingCommitments = commitments.filter((c) => c.status === 'pending');
  const acceptedCommitments = commitments.filter((c) => c.status === 'accepted');
  const rejectedCommitments = commitments.filter((c) => c.status === 'rejected');
  const leftCommitments = commitments.filter((c) => c.status === 'left');

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
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
              {session?.sport ?? 'Session'}
            </ThemedText>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}
            >
              <X size={18} color={theme.text} strokeWidth={2.5} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ThemedText muted>Loading...</ThemedText>
            </View>
          ) : session ? (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Card style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <MapPin size={16} color={theme.textSecondary} />
                  <ThemedText variant="body" style={styles.infoValue}>
                    {session.location}
                  </ThemedText>
                </View>

                <View style={styles.infoRow}>
                  <Clock size={16} color={theme.textSecondary} />
                  <ThemedText variant="body" style={styles.infoValue}>
                    {formatSessionDate(session.date_time)} at{' '}
                    {formatSessionTime(session.date_time)}
                  </ThemedText>
                </View>

                <View style={styles.infoRow}>
                  <Users size={16} color={theme.textSecondary} />
                  <ThemedText variant="body" style={styles.infoValue}>
                    {session.commitment_count ?? 0} / {session.max_participants} participants
                  </ThemedText>
                </View>
              </Card>

              {session.description && (
                <ThemedText variant="body" muted style={styles.description}>
                  {session.description}
                </ThemedText>
              )}

              <View style={styles.creatorRow}>
                <View
                  style={[styles.creatorAvatar, { backgroundColor: theme.textSecondary }]}
                >
                  <ThemedText
                    style={[styles.avatarText, { color: theme.background }]}
                  >
                    {(session.creator?.username ?? '?').charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View>
                  <ThemedText variant="caption" muted>
                    Posted by
                  </ThemedText>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {session.creator?.username ?? 'Unknown'}
                  </ThemedText>
                </View>
              </View>

              {/* Applicants section — visible to creator */}
              {isCreator && (
                <View style={styles.applicantsSection}>
                  <ThemedText variant="label" muted style={styles.sectionTitle}>
                    Applicants
                  </ThemedText>

                  {pendingCommitments.length === 0 && acceptedCommitments.length === 0 ? (
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
                            <View
                              style={[
                                styles.applicantAvatar,
                                { backgroundColor: theme.textSecondary },
                              ]}
                            >
                              <ThemedText
                                style={[styles.avatarText, { color: theme.background }]}
                              >
                                {(c.profile?.username ?? '?').charAt(0).toUpperCase()}
                              </ThemedText>
                            </View>
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
                            <View
                              style={[
                                styles.applicantAvatar,
                                { backgroundColor: '#10B981' },
                              ]}
                            >
                              <ThemedText
                                style={[styles.avatarText, { color: 'white' }]}
                              >
                                {(c.profile?.username ?? '?').charAt(0).toUpperCase()}
                              </ThemedText>
                            </View>
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
                                <View
                                  style={[
                                    styles.applicantAvatar,
                                    { backgroundColor: theme.textSecondary },
                                  ]}
                                >
                                  <ThemedText
                                    style={[styles.avatarText, { color: theme.background }]}
                                  >
                                    {(c.profile?.username ?? '?').charAt(0).toUpperCase()}
                                  </ThemedText>
                                </View>
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
                                <View
                                  style={[
                                    styles.applicantAvatar,
                                    { backgroundColor: '#A855F7', opacity: 0.6 },
                                  ]}
                                >
                                  <ThemedText
                                    style={[styles.avatarText, { color: 'white' }]}
                                  >
                                    {(c.profile?.username ?? '?').charAt(0).toUpperCase()}
                                  </ThemedText>
                                </View>
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
                    <Button
                      label="Yes, I'm In!"
                      onPress={handleCommit}
                      loading={joining}
                      buttonStyle={styles.actionBtn}
                    />
                  )}
                </>
              )}
            </ScrollView>
          ) : (
            <View style={styles.loadingContainer}>
              <ThemedText muted>Session not found</ThemedText>
            </View>
          )}
        </Animated.View>
      </View>
    </Modal>
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
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  actionBtn: {
    marginTop: Spacing.sm,
  },
  loadingContainer: {
    paddingVertical: Spacing.xxl,
    alignItems: 'center',
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
  applicantAvatar: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantDetails: {
    gap: 1,
    flex: 1,
  },
  applicantActions: {
    flexDirection: 'row',
    gap: Spacing.xs,
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
});
