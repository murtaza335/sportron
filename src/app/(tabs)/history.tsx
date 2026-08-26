import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, ChevronDown, Clock, MapPin, Timer, Users } from 'lucide-react-native';

import { SessionDetailPopup } from '@/components/SessionDetailPopup';
import { SessionFeedbackPopup } from '@/components/SessionFeedbackPopup';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useSessionFeed, useSessionHistory } from '@/hooks/useSessions';
import type { SessionScope } from '@/hooks/useSessions';
import { getSessionsView, subscribeSessionsView } from '@/lib/sessionsView';
import type { Session, SessionStatus } from '@/types';
import { formatSessionPurpose, SESSION_PURPOSES, SESSION_PURPOSE_LABELS } from '@/types';
import { fetchPendingFeedbackSessions, getRemainingTime } from '@/services/sessions';
import type { PendingFeedbackSession } from '@/services/sessions';

function formatSessionDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
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

function getStatusStyles(theme: ReturnType<typeof useTheme>): Record<SessionStatus, { bg: string; fg: string; label: string }> {
  const isDark = theme.resolvedColorScheme === 'dark';
  return {
    open: {
      bg: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)',
      fg: isDark ? '#34D399' : '#10B981',
      label: 'Open',
    },
    full: {
      bg: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.1)',
      fg: isDark ? '#FBBF24' : '#D97706',
      label: 'Full',
    },
    completed: {
      bg: isDark ? 'rgba(0, 168, 181, 0.15)' : 'rgba(0, 168, 181, 0.1)',
      fg: isDark ? '#2DD4BF' : '#00A8B5',
      label: 'Completed',
    },
    cancelled: {
      bg: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.1)',
      fg: isDark ? '#EF4444' : '#DC2626',
      label: 'Cancelled',
    },
    closed: {
      bg: isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(100, 116, 139, 0.1)',
      fg: theme.textSecondary,
      label: 'Closed',
    },
  };
}

function SessionCard({ session, onPress }: { session: Session; onPress: () => void }) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  const statusStyle = getStatusStyles(theme)[session.status] ?? getStatusStyles(theme).closed;
  const isActive = session.status === 'open' || session.status === 'full';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
    >
      <Card style={styles.sessionCard}>
        <View style={styles.cardTop}>
          <ThemedText variant="heading" style={styles.purposeName} numberOfLines={1}>
            {session.title ?? formatSessionPurpose(session.purpose)}
          </ThemedText>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <ThemedText variant="caption" style={[styles.statusText, { color: statusStyle.fg }]}>
              {statusStyle.label}
            </ThemedText>
          </View>
        </View>

        {/* Sport purpose pill — capsule, semi-transparent accent */}
        <View
          style={[
            styles.sportPill,
            {
              backgroundColor: isDark
                ? 'rgba(0, 168, 181, 0.15)'
                : 'rgba(0, 168, 181, 0.1)',
            },
          ]}
        >
          <ThemedText
            variant="caption"
            style={[styles.sportPillText, { color: isDark ? '#2DD4BF' : '#00A8B5' }]}
          >
            {formatSessionPurpose(session.purpose)}
          </ThemedText>
        </View>

        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <MapPin size={14} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText
              variant="caption"
              style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 12 }}
            >
              {session.location}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <Calendar size={14} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText
              variant="caption"
              style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 12 }}
            >
              {formatSessionDate(session.date_time)}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <Clock size={14} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText
              variant="caption"
              style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 12 }}
            >
              {formatSessionTime(session.date_time)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.footerLeft}>
            {isActive && session.expires_at && (
              <View style={[styles.expiryBadge, { backgroundColor: `${theme.warning}20` }]}>
                <Timer size={12} color={theme.warning} strokeWidth={2} />
                <ThemedText
                  variant="caption"
                  style={{ color: theme.warning, fontWeight: '700', fontSize: 10 }}
                >
                  {getRemainingTime(session.expires_at)}
                </ThemedText>
              </View>
            )}
            <Users size={14} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText
              variant="caption"
              style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 12 }}
            >
              {session.commitment_count ?? 0} / {session.max_participants}
            </ThemedText>
          </View>
          <ThemedText
            variant="caption"
            style={{ color: theme.textSecondary, fontWeight: '500', fontSize: 12 }}
          >
            by {session.creator?.username ?? 'Unknown'}
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.text : theme.backgroundElement, borderColor: theme.border },
      ]}
    >
      <ThemedText
        variant="caption"
        style={[styles.chipText, selected && { color: theme.background }]}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function SessionsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<SessionScope>('all');
  const [purposeFilter, setPurposeFilter] = useState<string | null>(null);
  const [showPurposeModal, setShowPurposeModal] = useState(false);

  const { sessions, loading, refreshing, refresh } = useSessionFeed(user?.id, scope);
  const {
    sessions: historySessions,
    loading: historyLoading,
    refreshing: historyRefreshing,
    refresh: refreshHistory,
  } = useSessionHistory(user?.id);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<Partial<Session> | null>(null);

  const params = useLocalSearchParams<{ sessionId?: string | string[] }>();
  const sessionIdParam = typeof params.sessionId === 'string' ? params.sessionId : undefined;
  const isHistory = useSyncExternalStore(subscribeSessionsView, getSessionsView) === 'history';

  const openSessionId = selectedSessionId ?? sessionIdParam ?? null;
  const detailVisible = openSessionId !== null;

  const closePopup = () => {
    setSelectedSessionId(null);
    setSelectedSessionData(null);
    if (sessionIdParam) router.setParams({ sessionId: undefined });
  };

  // Post-session feedback loop — when the creator opens the Sessions tab, a
  // popup asks them to mark who attended their ended sessions before anything
  // else, so they give feedback before creating a new session.
  const [feedbackSessions, setFeedbackSessions] = useState<PendingFeedbackSession[]>([]);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const loadPendingFeedback = useCallback(async () => {
    if (!user?.id) return;
    try {
      const pending = await fetchPendingFeedbackSessions(user.id);
      if (pending.length === 0 || detailVisible) return;
      setFeedbackSessions(pending);
      setFeedbackVisible(true);
    } catch (e) {
      console.error('Failed to check pending session feedback:', e);
    }
  }, [user, detailVisible]);

  useFocusEffect(
    useCallback(() => {
      loadPendingFeedback();
    }, [loadPendingFeedback]),
  );

  // Countdown ticker — re-renders every 30s to update "closes in X" labels
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const filteredSessions = useMemo(() => {
    if (!purposeFilter) return sessions;
    return sessions.filter((s) => s.purpose === purposeFilter);
  }, [sessions, purposeFilter]);

  const hasFilters = purposeFilter !== null;
  const listData = isHistory ? historySessions : filteredSessions;
  const listLoading = isHistory ? historyLoading : loading;
  const listRefreshing = isHistory ? historyRefreshing : refreshing;
  const onRefresh = isHistory ? refreshHistory : refresh;

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {!isHistory && (
          <View style={styles.filterBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
              style={styles.chipsScroll}
            >
              <FilterChip label="All" selected={scope === 'all'} onPress={() => setScope('all')} />
              <FilterChip
                label="Joined"
                selected={scope === 'joined'}
                onPress={() => setScope('joined')}
              />
              <FilterChip label="My" selected={scope === 'my'} onPress={() => setScope('my')} />
              <Pressable
                onPress={() => setShowPurposeModal(true)}
                style={[
                  styles.chip,
                  styles.purposeDropdown,
                  {
                    backgroundColor: purposeFilter ? theme.text : theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              >
                <ThemedText
                  variant="caption"
                  style={[
                    styles.chipText,
                    purposeFilter && { color: theme.background },
                  ]}
                >
                  {purposeFilter ? formatSessionPurpose(purposeFilter) : 'All purposes'}
                </ThemedText>
                <ChevronDown
                  size={14}
                  color={purposeFilter ? theme.background : theme.textSecondary}
                  strokeWidth={2.5}
                />
              </Pressable>
            </ScrollView>
          </View>
        )}

        {listLoading && !listRefreshing ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Spacing.xxxl + Math.max(insets.bottom, 56) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={listRefreshing} onRefresh={onRefresh} tintColor={theme.text} />
            }
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            ListEmptyComponent={
              !listRefreshing ? (
                <View style={styles.empty}>
                  <View style={styles.emptyIcon}>
                    <Calendar size={48} color={theme.textSecondary} strokeWidth={1.5} />
                  </View>
                  {!isHistory ? (
                    scope === 'all' ? (
                      <>
                        <ThemedText variant="body" muted style={styles.emptyText}>
                          {hasFilters ? 'No sessions match your filters' : 'No open sessions yet'}
                        </ThemedText>
                        <ThemedText variant="caption" muted style={styles.emptySubtext}>
                          {hasFilters
                            ? 'Try a different purpose'
                            : 'Be the first to post a session!'}
                        </ThemedText>
                      </>
                    ) : scope === 'joined' ? (
                      <>
                        <ThemedText variant="body" muted style={styles.emptyText}>
                          {hasFilters ? 'No joined sessions match' : 'No joined sessions yet'}
                        </ThemedText>
                        <ThemedText variant="caption" muted style={styles.emptySubtext}>
                          {hasFilters
                            ? 'Try a different purpose'
                            : 'Join a session to see it here'}
                        </ThemedText>
                      </>
                    ) : (
                      <>
                        <ThemedText variant="body" muted style={styles.emptyText}>
                          {hasFilters ? 'No sessions match your filters' : 'No sessions yet'}
                        </ThemedText>
                        <ThemedText variant="caption" muted style={styles.emptySubtext}>
                          {hasFilters
                            ? 'Try a different purpose'
                            : 'Create a session to get started!'}
                        </ThemedText>
                      </>
                    )
                  ) : (
                    <>
                      <ThemedText variant="body" muted style={styles.emptyText}>
                        No past sessions yet
                      </ThemedText>
                      <ThemedText variant="caption" muted style={styles.emptySubtext}>
                        Sessions you host or join will show up here once they end
                      </ThemedText>
                    </>
                  )}
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <SessionCard
                session={item}
                onPress={() => {
                  setSelectedSessionId(item.id);
                  setSelectedSessionData(item);
                }}
              />
            )}
          />
        )}
      </View>

      <SessionDetailPopup
        key={openSessionId ?? 'closed'}
        sessionId={openSessionId}
        visible={detailVisible}
        onClose={closePopup}
        currentUserId={user?.id}
        initialSession={selectedSessionData}
        onRefreshFeed={() => {
          if (!isHistory) refresh();
          else refreshHistory();
        }}
      />

      <SessionFeedbackPopup
        key={feedbackVisible ? 'session-feedback-open' : 'session-feedback-closed'}
        sessions={feedbackSessions}
        visible={feedbackVisible}
        currentUserId={user?.id}
        onClose={() => setFeedbackVisible(false)}
        onDone={() => {
          setFeedbackSessions([]);
          setFeedbackVisible(false);
          if (!isHistory) refresh();
          else refreshHistory();
        }}
      />

      <Modal
        transparent
        visible={showPurposeModal}
        animationType="fade"
        onRequestClose={() => setShowPurposeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowPurposeModal(false)}
          />
          <View
            style={[
              styles.pickerSheet,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <ThemedText variant="label" style={styles.pickerTitle}>
              Filter by purpose
            </ThemedText>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.pickerOptions}
              style={{ maxHeight: 360 }}
            >
              <Pressable
                onPress={() => {
                  setPurposeFilter(null);
                  setShowPurposeModal(false);
                }}
                style={[
                  styles.pickerOption,
                  {
                    backgroundColor:
                      purposeFilter === null ? theme.backgroundElement : theme.background,
                  },
                ]}
              >
                <ThemedText
                  variant="body"
                  style={purposeFilter === null ? { fontWeight: '700' } : undefined}
                >
                  All purposes
                </ThemedText>
              </Pressable>
              {SESSION_PURPOSES.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    setPurposeFilter(purposeFilter === p ? null : p);
                    setShowPurposeModal(false);
                  }}
                  style={[
                    styles.pickerOption,
                    {
                      backgroundColor:
                        purposeFilter === p ? theme.backgroundElement : theme.background,
                    },
                  ]}
                >
                  <ThemedText
                    variant="body"
                    style={purposeFilter === p ? { fontWeight: '700' } : undefined}
                  >
                    {SESSION_PURPOSE_LABELS[p]}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  list: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxl,
    flexGrow: 1,
  },
  loader: {
    marginTop: Spacing.xxl,
  },
  filterBar: {
    height: 40,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  chipsScroll: {
    height: '100%',
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: '100%',
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontWeight: '700',
    fontSize: 12,
  },
  purposeDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  pickerTitle: {
    marginBottom: Spacing.sm,
  },
  pickerOptions: {
    paddingBottom: Spacing.xs,
  },
  pickerOption: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.md,
    marginTop: Spacing.xs,
  },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'currentColor',
    opacity: 0.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 280,
  },
  emptySubtext: {
    textAlign: 'center',
    maxWidth: 280,
  },
  sessionCard: {
    gap: Spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  purposeName: {
    fontSize: 20,
    fontWeight: '700',
    flexShrink: 1,
  },
  sportPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  sportPillText: {
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  expiryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  cardDetails: {
    gap: Spacing.xs,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.xs,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
