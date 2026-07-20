import { Calendar, Clock, MapPin, Users, X } from 'lucide-react-native';
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
  checkTimeConflicts,
  commitToSession,
  fetchSessionById,
  uncommitFromSession,
} from '@/services/sessions';
import type { Session } from '@/types';

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
  const [joining, setJoining] = useState(false);
  const [isCommitted, setIsCommitted] = useState(false);
  const loading = visible && session === null && sessionId !== null;

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
          setIsCommitted(!!data?.my_commitment);
        }
      })
      .catch((e) => console.error('Failed to load session:', e));
  }, [visible, sessionId, currentUserId]);



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
      setIsCommitted(true);
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
      setIsCommitted(false);
      onRefreshFeed?.();
    } catch (e) {
      Alert.alert('Error', 'Failed to leave session.');
      console.error('Uncommit error:', e);
    } finally {
      setJoining(false);
    }
  };

  if (!visible) return null;

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
                  <Calendar size={16} color={theme.textSecondary} />
                  <ThemedText variant="body" style={styles.infoValue}>
                    {formatSessionDate(session.date_time)}
                  </ThemedText>
                </View>

                <View style={styles.infoRow}>
                  <Clock size={16} color={theme.textSecondary} />
                  <ThemedText variant="body" style={styles.infoValue}>
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

              {isCommitted ? (
                <Button
                  label="Leave Session"
                  variant="secondary"
                  onPress={handleUncommit}
                  loading={joining}
                  buttonStyle={styles.actionBtn}
                />
              ) : currentUserId && currentUserId !== session.created_by ? (
                <Button
                  label="Yes, I'm In!"
                  onPress={handleCommit}
                  loading={joining}
                  buttonStyle={styles.actionBtn}
                />
              ) : null}
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
});
