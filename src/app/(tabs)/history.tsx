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
  
  // The hook correctly takes user?.id and the mode ('global' for public feed, 'mine' for involved matches)
  const { matches, loading, refreshing, refresh } = useMatches(user?.id, mode);
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProfiles | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh, mode]), // Added mode as a dependency to refresh when changing tabs
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <ThemedText variant="title">History</ThemedText>

        {/* Clean, responsive tab switching mapping directly to your backend modes */}
        <SegmentedControl
          options={[
            { value: 'global', label: 'All Matches' },
            { value: 'mine', label: 'My Matches' },
          ]}
          value={mode}
          onChange={(value) => setMode(value as FeedMode)}
        />

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
                <ThemedText variant="body" muted>
                  {mode === 'global' 
                    ? 'No public matches yet.' 
                    : 'You have not been involved in any matches yet.'}
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

      {/* The bottom sheet layout component */}
      <MatchDetailPopup
        match={selectedMatch}
        visible={detailVisible}
        onClose={() => {
          setDetailVisible(false);
          setSelectedMatch(null);
        }}
        currentUserId={user?.id}
        onRefreshFeed={refresh} // Automatically triggers live re-fetching on social interactions
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
  list: {
    paddingBottom: Spacing.xxl,
    flexGrow: 1,
  },
  loader: {
    marginTop: Spacing.xxl,
  },
  empty: {
    paddingTop: Spacing.xxl,
    alignItems: 'center',
  },
});