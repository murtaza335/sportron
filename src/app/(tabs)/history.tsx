import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Calendar, Clock, MapPin, Users } from 'lucide-react-native';

import { SessionDetailPopup } from '@/components/SessionDetailPopup';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useSessions } from '@/hooks/useSessions';
import type { Session } from '@/types';

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

export default function SessionsScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { sessions, loading, refreshing, refresh } = useSessions(user?.id);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionData, setSelectedSessionData] = useState<Partial<Session> | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        {loading && !refreshing ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refresh}
                tintColor={theme.text}
              />
            }
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Calendar size={48} color={theme.textSecondary} strokeWidth={1.5} />
                </View>
                <ThemedText variant="body" muted style={styles.emptyText}>
                  No open sessions yet
                </ThemedText>
                <ThemedText variant="caption" muted style={styles.emptySubtext}>
                  Be the first to post a session!
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setSelectedSessionId(item.id);
                  setSelectedSessionData(item);
                  setDetailVisible(true);
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
              >
                <Card style={styles.sessionCard}>
                  <View style={styles.cardTop}>
                    <ThemedText variant="heading" style={styles.sportName}>
                      {item.sport}
                    </ThemedText>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            item.status === 'open'
                              ? '#10B98120'
                              : '#D9770620',
                        },
                      ]}
                    >
                      <ThemedText
                        variant="caption"
                        style={[
                          styles.statusText,
                          {
                            color: item.status === 'open' ? '#10B981' : '#D97706',
                          },
                        ]}
                      >
                        {item.status === 'open' ? 'Open' : 'Full'}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.cardDetails}>
                    <View style={styles.detailRow}>
                      <MapPin size={14} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted>
                        {item.location}
                      </ThemedText>
                    </View>
                    <View style={styles.detailRow}>
                      <Calendar size={14} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted>
                        {formatSessionDate(item.date_time)}
                      </ThemedText>
                    </View>
                    <View style={styles.detailRow}>
                      <Clock size={14} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted>
                        {formatSessionTime(item.date_time)}
                      </ThemedText>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <View style={styles.footerLeft}>
                      <Users size={14} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted>
                        {item.commitment_count ?? 0} / {item.max_participants}
                      </ThemedText>
                    </View>
                    <ThemedText variant="caption" muted>
                      by {item.creator?.username ?? 'Unknown'}
                    </ThemedText>
                  </View>
                </Card>
              </Pressable>
            )}
          />
        )}
      </View>

      <SessionDetailPopup
        key={selectedSessionId ?? 'closed'}
        sessionId={selectedSessionId}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedSessionId(null);
          setSelectedSessionData(null);
        }}
        currentUserId={user?.id}
        initialSession={selectedSessionData}
        onRefreshFeed={refresh}
      />
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
    paddingBottom: Spacing.xxxl,
    flexGrow: 1,
  },
  loader: {
    marginTop: Spacing.xxl,
  },
  empty: {
    paddingTop: Spacing.xxxl,
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
  },
  sportName: {
    fontSize: 20,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
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
