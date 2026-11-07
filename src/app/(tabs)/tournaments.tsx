import { Trophy } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TournamentCard } from '@/components/tournaments/TournamentCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournaments } from '@/hooks/useTournaments';
import type { TournamentScope } from '@/types';

const SCOPES: { value: TournamentScope; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
  { value: 'mine', label: 'Mine' },
];

const EMPTY: Record<TournamentScope, { title: string; sub?: string }> = {
  live: { title: 'Nothing live right now', sub: 'Live tournaments show up here.' },
  upcoming: { title: 'No upcoming tournaments' },
  past: { title: 'No past tournaments' },
  mine: { title: "You're not part of any tournament yet", sub: 'When an admin adds you, it will show up here.' },
  all: { title: 'No tournaments' },
};

export default function TournamentsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<TournamentScope>('live');
  const { tournaments, loading, refreshing, refresh } = useTournaments(scope);
  const empty = EMPTY[scope];

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.controls}>
        <SegmentedControl options={SCOPES} value={scope} onChange={setScope} compact />
      </View>
      <FlatList
        data={tournaments}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => <TournamentCard tournament={item} />}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.lg + Math.max(insets.bottom, 56) }]}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.text} />}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={theme.text} style={styles.loader} />
          ) : (
            <View style={styles.empty}>
              <Trophy size={48} color={theme.textSecondary} strokeWidth={1.5} />
              <ThemedText variant="heading">{empty.title}</ThemedText>
              {empty.sub && (
                <ThemedText muted style={styles.emptySub}>
                  {empty.sub}
                </ThemedText>
              )}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  controls: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  list: {
    flexGrow: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.md,
  },
  loader: { marginTop: Spacing.xxl },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  emptySub: { textAlign: 'center' },
});
