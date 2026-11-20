import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { LiveMatchCard } from '@/components/live/LiveMatchCard';
import { LivePill } from '@/components/live/LivePill';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useLiveBoard, useLiveTournaments } from '@/hooks/useLiveBoard';
import { useTheme } from '@/hooks/use-theme';
import { tournamentRoutes } from '@/lib/tournamentRoutes';

/** "Live now" on the tournament screen: up to 3 live matches (glanceable — polls every 20 s, no socket). Hidden when nothing is live. */
export function LiveNowSection({ tournamentId }: { tournamentId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { board, unavailable, serverOffsetMs } = useLiveBoard(tournamentId, { realtime: false, pollMs: 20_000 });
  const live = board?.live ?? [];
  if (unavailable || live.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <LivePill />
        <ThemedText variant="label" muted style={{ flex: 1 }}>
          Live now · {live.length}
        </ThemedText>
        <Pressable onPress={() => router.push(tournamentRoutes.liveBoard(tournamentId))} hitSlop={8} accessibilityRole="button">
          <ThemedText style={{ color: theme.accent, fontWeight: '800' }}>See all live</ThemedText>
        </Pressable>
      </View>
      {live.slice(0, 3).map((m) => (
        <LiveMatchCard key={m.match_id} m={m} serverOffsetMs={serverOffsetMs} onPress={() => router.push(tournamentRoutes.liveMatch(tournamentId, m.match_id))} />
      ))}
    </View>
  );
}

/** Tournaments tab: one chip per tournament with matches in play. Hidden when nothing is live. */
export function LiveTournamentsStrip() {
  const theme = useTheme();
  const router = useRouter();
  const { chips, unavailable } = useLiveTournaments();
  if (unavailable || chips.length === 0) return null;
  return (
    <View style={{ gap: Spacing.xs, marginBottom: Spacing.md }}>
      {chips.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push(tournamentRoutes.liveBoard(c.id))}
          accessibilityRole="button"
          accessibilityLabel={`${c.name}, ${c.live_count} live`}
          style={[styles.chip, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <LivePill compact />
          <ThemedText numberOfLines={1} style={{ flex: 1, fontWeight: '700' }}>
            {c.name}
          </ThemedText>
          <ThemedText muted style={{ fontWeight: '700' }}>
            {c.live_count} live
          </ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  chip: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: 12, paddingHorizontal: Spacing.md, paddingVertical: 12 },
});
