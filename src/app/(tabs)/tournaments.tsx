import { Trophy } from 'lucide-react-native';
import { AnnouncementHost } from '@/components/AnnouncementHost';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { EmptyReveal } from '@/components/motion/EmptyReveal';
import { FadeInItem } from '@/components/motion/FadeInItem';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { Duration, RM } from '@/lib/motion';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TournamentCard } from '@/components/tournaments/TournamentCard';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { TipCard } from '@/components/TipCard';
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
  const { tournaments, loading, refreshing, error, refresh } = useTournaments(scope);
  const empty = EMPTY[scope];
  const firstLoad = useFirstLoad(loading);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.controls}>
        <SegmentedControl options={SCOPES} value={scope} onChange={setScope} compact />
      </View>
      <Animated.View key={scope} style={{ flex: 1 }} entering={FadeIn.duration(Duration.base).reduceMotion(RM)}>
      <FlatList
        data={tournaments}
        keyExtractor={(t) => t.id}
        renderItem={({ item, index }) => (
          <FadeInItem index={index} animate={firstLoad}>
            <TournamentCard tournament={item} />
          </FadeInItem>
        )}
        ListHeaderComponent={
          <>
            <AnnouncementHost placement="tournaments_banner" />
            <TipCard id="tournaments" />
          </>
        }
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.lg + Math.max(insets.bottom, 56) }]}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListEmptyComponent={
          loading ? (
            <SkeletonList Item={TournamentCardSkeleton} count={3} />
          ) : error ? (
            <View style={styles.empty}>
              <Trophy size={48} color={theme.textSecondary} strokeWidth={1.5} />
              <ThemedText variant="heading">Couldn&apos;t load tournaments</ThemedText>
              <ThemedText muted style={styles.emptySub}>Pull down to try again.</ThemedText>
            </View>
          ) : (
            <EmptyReveal
              style={styles.empty}
              icon={<Trophy size={48} color={theme.textSecondary} strokeWidth={1.5} />}>
              <ThemedText variant="heading">{empty.title}</ThemedText>
              {empty.sub && (
                <ThemedText muted style={styles.emptySub}>
                  {empty.sub}
                </ThemedText>
              )}
            </EmptyReveal>
          )
        }
      />
      </Animated.View>
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
