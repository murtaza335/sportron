import { Stack, useRouter } from 'expo-router';
import { ChevronRight, ClipboardList } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { LivePill } from '@/components/live/LivePill';
import { EmptyReveal } from '@/components/motion/EmptyReveal';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useFlag } from '@/contexts/RemoteConfigContext';
import { useScoringMatches } from '@/hooks/useScoringMatches';
import { useTheme } from '@/hooks/use-theme';
import { formatMatchTime } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { ScoringMatch } from '@/types';

type Section = { title: string; data: ScoringMatch[] };

/** Live first (mine on top), then today's matches (device-local day), then everything else. */
function group(matches: ScoringMatch[]): Section[] {
  const today = new Date().toDateString();
  const live = matches.filter((m) => m.live_state);
  const rest = matches.filter((m) => !m.live_state);
  const isToday = (m: ScoringMatch) => !!m.scheduled_at && new Date(m.scheduled_at).toDateString() === today;
  return [
    { title: 'Live now', data: [...live].sort((a, b) => Number(b.mine) - Number(a.mine)) },
    { title: 'Today', data: rest.filter(isToday) },
    { title: 'Later and unscheduled', data: rest.filter((m) => !isToday(m)) },
  ].filter((s) => s.data.length > 0);
}

function Row({ m, onPress }: { m: ScoringMatch; onPress: () => void }) {
  const theme = useTheme();
  const when = formatMatchTime(m.scheduled_at);
  const place = [m.venue, m.court].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Score ${m.a_name} against ${m.b_name}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: m.mine ? theme.accent : theme.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={{ fontWeight: '800', fontSize: 17 }}>
          {m.a_name} vs {m.b_name}
        </ThemedText>
        <ThemedText variant="caption" muted numberOfLines={1}>
          {[m.module_name, m.round_name].filter(Boolean).join(' · ')}
        </ThemedText>
        <ThemedText variant="caption" muted numberOfLines={1}>
          {[when, place].filter(Boolean).join(' · ') || m.tournament_name}
        </ThemedText>
        {m.live_state && (
          <View style={styles.liveRow}>
            <LivePill compact />
            <ThemedText variant="caption" style={{ fontWeight: '700' }}>
              {m.mine ? 'You are scoring' : m.scorer_name ? `@${m.scorer_name} is scoring` : 'Waiting for a scorer'}
            </ThemedText>
          </View>
        )}
      </View>
      <ChevronRight size={22} color={theme.textSecondary} />
    </Pressable>
  );
}

export default function ToScoreScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scorerUi = useFlag('organizations', false);
  const liveOn = useFlag('live_scoring', false);
  const { matches, loading, error, refreshing, refresh } = useScoringMatches(scorerUi && liveOn);
  const sections = useMemo(() => group(matches ?? []), [matches]);
  const header = (
    <Stack.Screen
      options={{ title: 'To score', headerShown: true, headerLeft: () => <HeaderBack fallback="/tournaments" /> }}
    />
  );

  if (!scorerUi || !liveOn) {
    return (
      <View style={[styles.empty, { backgroundColor: theme.background, flex: 1 }]}>
        {header}
        <ThemedText variant="heading">Scoring isn&apos;t available yet</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.match_id}
        renderItem={({ item }) => (
          <Row m={item} onPress={() => router.push(tournamentRoutes.score(item.tournament_id, item.module_id, item.match_id))} />
        )}
        renderSectionHeader={({ section }) => (
          <ThemedText variant="label" muted style={styles.sectionTitle}>
            {section.title}
          </ThemedText>
        )}
        stickySectionHeadersEnabled={false}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.lg + insets.bottom }]}
        refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />}
        ListHeaderComponent={
          error ? (
            <View style={[styles.error, { borderColor: theme.error }]}>
              <ThemedText style={{ fontWeight: '700' }}>
                {matches ? 'Showing saved list' : 'Couldn’t load your matches'}
              </ThemedText>
              <ThemedText variant="caption" muted>{error}</ThemedText>
              <Button label="Try again" variant="secondary" onPress={() => void refresh()} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonList Item={TournamentCardSkeleton} count={3} />
          ) : error ? null : (
            <EmptyReveal style={styles.empty} icon={<ClipboardList size={48} color={theme.textSecondary} strokeWidth={1.5} />}>
              <ThemedText variant="heading">No matches to score</ThemedText>
              <ThemedText muted style={{ textAlign: 'center' }}>
                Your sport manager adds you to a sport. Matches appear here once the draw is made.
              </ThemedText>
            </EmptyReveal>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md },
  sectionTitle: { marginTop: Spacing.sm, marginBottom: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1.5, borderRadius: Radius.lg, padding: Spacing.md, minHeight: 84 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 4 },
  error: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, marginBottom: Spacing.md },
  empty: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
});
