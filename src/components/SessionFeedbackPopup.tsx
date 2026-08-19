import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Check, ClipboardCheck, X, Clock, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { submitSessionFeedback, type PendingFeedbackSession } from '@/services/sessions';
import type { FeedbackStatus } from '@/types';
import { formatSessionPurpose } from '@/types';

type SessionFeedbackPopupProps = {
  sessions: PendingFeedbackSession[];
  visible: boolean;
  onClose: () => void;
  onDone: () => void;
  currentUserId?: string;
};

function initialMarks(commitments: PendingFeedbackSession['commitments']): Record<string, FeedbackStatus> {
  const initial: Record<string, FeedbackStatus> = {};
  for (const c of commitments) initial[c.id] = 'showed_up';
  return initial;
}

function formatSessionDate(dateString: string) {
  return new Date(dateString).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatSessionTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SessionFeedbackPopup({
  sessions,
  visible,
  onClose,
  onDone,
  currentUserId,
}: SessionFeedbackPopupProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [marks, setMarks] = useState<Record<string, FeedbackStatus>>(() =>
    initialMarks(sessions[0]?.commitments ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  const session = visible && sessions.length > 0 ? sessions[Math.min(index, sessions.length - 1)] : null;

  if (!visible || !session) return null;

  const displayName = session.title ?? formatSessionPurpose(session.purpose);

  const handleSubmit = async () => {
    if (!currentUserId || !session) return;
    setSubmitting(true);
    try {
      await submitSessionFeedback(
        currentUserId,
        session.id,
        session.commitments.map((c) => ({ commitmentId: c.id, status: marks[c.id] ?? 'showed_up' })),
      );
      if (index + 1 < sessions.length) {
        const next = sessions[index + 1];
        setIndex(index + 1);
        setMarks(initialMarks(next?.commitments ?? []));
      } else {
        onDone();
      }
    } catch (e) {
      console.error('Failed to submit session feedback:', e);
      Alert.alert('Failed to save', 'Could not save feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const setMark = (commitmentId: string, status: FeedbackStatus) => {
    setMarks((prev) => ({ ...prev, [commitmentId]: status }));
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: Spacing.lg + Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: theme.border }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.headerTitleWrap}>
              <View style={[styles.headerIcon, { backgroundColor: '#10B98120' }]}>
                <ClipboardCheck size={18} color="#10B981" strokeWidth={2.5} />
              </View>
              <ThemedText variant="heading" style={styles.headerTitle} numberOfLines={1}>
                Attended the session?
              </ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={16}
              style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}
            >
              <X size={18} color={theme.text} strokeWidth={2.5} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Card style={styles.infoCard}>
              <ThemedText variant="body" style={styles.infoTitle} numberOfLines={1}>
                {displayName}
              </ThemedText>
              <View style={styles.infoRow}>
                <Clock size={14} color={theme.textSecondary} />
                <ThemedText variant="caption" muted>
                  {formatSessionDate(session.date_time)} at {formatSessionTime(session.date_time)}
                </ThemedText>
              </View>
              <View style={styles.infoRow}>
                <MapPin size={14} color={theme.textSecondary} />
                <ThemedText variant="caption" muted numberOfLines={1} style={styles.infoText}>
                  {session.location}
                </ThemedText>
              </View>
            </Card>

            <ThemedText variant="label" muted style={styles.sectionTitle}>
              Who showed up? ({session.commitments.length})
            </ThemedText>
            {session.commitments.map((c) => (
              <View
                key={c.id}
                style={[
                  styles.participantRow,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <View style={styles.participantInfo}>
                  <UserAvatar avatarUrl={c.profile?.avatar_url} size={36} />
                  <ThemedText variant="body" style={styles.participantName} numberOfLines={1}>
                    {c.profile?.username ?? 'Unknown'}
                  </ThemedText>
                </View>
                <View style={styles.markGroup}>
                  <Pressable
                    onPress={() => setMark(c.id, 'showed_up')}
                    style={[
                      styles.markChip,
                      { borderColor: marks[c.id] === 'showed_up' ? '#10B981' : theme.border, backgroundColor: marks[c.id] === 'showed_up' ? '#10B98120' : theme.background },
                    ]}
                  >
                    <Check size={14} color={marks[c.id] === 'showed_up' ? '#10B981' : theme.textSecondary} strokeWidth={3} />
                    <ThemedText variant="caption" style={{ color: marks[c.id] === 'showed_up' ? '#10B981' : theme.textSecondary, fontWeight: '700' }}>
                      Came
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => setMark(c.id, 'no_show')}
                    style={[
                      styles.markChip,
                      { borderColor: marks[c.id] === 'no_show' ? '#EF4444' : theme.border, backgroundColor: marks[c.id] === 'no_show' ? '#EF444420' : theme.background },
                    ]}
                  >
                    <X size={14} color={marks[c.id] === 'no_show' ? '#EF4444' : theme.textSecondary} strokeWidth={3} />
                    <ThemedText variant="caption" style={{ color: marks[c.id] === 'no_show' ? '#EF4444' : theme.textSecondary, fontWeight: '700' }}>
                      Didn&apos;t come
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.border }]}>
            <Button label="Not now" variant="ghost" onPress={onClose} buttonStyle={styles.footerGhost} />
            <Button
              label={index + 1 < sessions.length ? 'Save & next' : 'Save feedback'}
              loading={submitting}
              onPress={handleSubmit}
              buttonStyle={styles.footerButton}
            />
          </View>
        </View>
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
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexShrink: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    gap: Spacing.sm,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  infoCard: {
    gap: Spacing.xs,
  },
  infoTitle: {
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  infoText: {
    flexShrink: 1,
  },
  sectionTitle: {
    marginLeft: Spacing.xs,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  participantInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  participantName: {
    flexShrink: 1,
    fontWeight: '600',
  },
  markGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  markChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  footerGhost: {
    flex: 1,
  },
  footerButton: {
    flex: 2,
  },
});