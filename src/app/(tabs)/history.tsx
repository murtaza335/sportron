import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';

import { MatchCard } from '@/components/MatchCard';
import { MatchDetailPopup } from '@/components/MatchDetailPopup';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useMatches } from '@/hooks/useMatches';
import type { MatchWithProfiles } from '@/types';

type FeedMode = 'global' | 'mine';

export default function HistoryScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [mode, setMode] = useState<FeedMode>('global');

  const { matches, loading, refreshing, refresh } = useMatches(user?.id, mode);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText variant="title">History</ThemedText>
        </View>

        <View style={styles.filterRow}>
          <ThemedText variant="caption" muted style={styles.filterLabel}>
            Filter
          </ThemedText>
          <SegmentedControl
            options={[
              { value: 'global', label: 'All Matches' },
              { value: 'mine', label: 'My Matches' },
            ]}
            value={mode}
            onChange={(value) => setMode(value as FeedMode)}
          />
        </View>

        {loading && !refreshing ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.text} />
            }
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIcon}>
                  <Clock size={48} color={theme.textSecondary} strokeWidth={1.5} />
                </View>
                <ThemedText variant="body" muted style={styles.emptyText}>
                  {mode === 'global'
                    ? 'No public matches yet.'
                    : 'You have not been involved in any matches yet.'}
                </ThemedText>
                <ThemedText variant="caption" muted style={styles.emptySubtext}>
                  {mode === 'global'
                    ? 'Be the first to record a match!'
                    : 'Start playing to see your matches here.'}
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => (
              <MatchCard
                match={item}
                currentUserId={user?.id}
                showYoursBadge={mode === 'global'}
                onPress={() => {
                  setSelectedMatch(item);
                  setDetailVisible(true);
                }}
              />
            )}
          />
        )}
      </View>

      <MatchDetailPopup
        match={selectedMatch}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedMatch(null);
        }}
        currentUserId={user?.id}
        onRefreshFeed={refresh}
      />
    </SafeAreaView>
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
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  filterRow: {
    gap: Spacing.sm,
  },
  filterLabel: {
    marginLeft: Spacing.xs,
    marginBottom: Spacing.xs,
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
    paddingBottom: Spacing.xxxl,
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
});