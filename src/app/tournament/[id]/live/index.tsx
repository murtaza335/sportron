import { useLocalSearchParams, useRouter } from 'expo-router';
import { Radio } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveMatchCard, matchHeading } from '@/components/live/LiveMatchCard';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useLiveBoard } from '@/hooks/useLiveBoard';
import { useTheme } from '@/hooks/use-theme';
import { compareCourts, courtKey, type LiveMatch } from '@/lib/live';
import { formatClock } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accent : theme.backgroundElement }]}
    >
      <ThemedText style={{ color: selected ? '#fff' : theme.text, fontWeight: '700' }}>{label}</ThemedText>
    </Pressable>
  );
}

/** Every live court of a tournament, up next and recent results — the in-app scoreboard wall. */
export default function LiveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { board, loading, unavailable, refreshing, refresh, serverOffsetMs } = useLiveBoard(id, { realtime: true });
  const [module, setModule] = useState<string | null>(null);
  const [court, setCourt] = useState<string | null>(null);

  const live = useMemo(() => board?.live ?? [], [board]);
  const modules = useMemo(() => {
    const seen = new Map<string, string>();
    [...live, ...(board?.recent ?? [])].forEach((m) => seen.set(m.module_id, m.module_name ?? 'Module'));
    return [...seen.entries()];
  }, [live, board]);
  const courts = useMemo(() => {
    const seen = new Map<string, string>();
    live.forEach((m) => {
      if (m.court) seen.set(courtKey(m.court), m.court.trim());
    });
    return [...seen.values()].sort(compareCourts);
  }, [live]);

  const pass = (m: LiveMatch) => (!module || m.module_id === module) && (!court || courtKey(m.court) === courtKey(court));
  const sortedLive = useMemo(
    () => live.filter(pass).sort((a, b) => compareCourts(a.court ?? '~', b.court ?? '~') || (a.started_at ?? '').localeCompare(b.started_at ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, module, court],
  );
  const recent = (board?.recent ?? []).filter(pass);
  const next = (board?.up_next ?? []).filter((m) => !module || m.module_id === module);
  const open = (m: LiveMatch) => router.push(tournamentRoutes.liveMatch(id, m.match_id));

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <ThemedText variant="heading" numberOfLines={2}>
        {board?.tournament?.name ?? 'Live'}
      </ThemedText>

      {loading && !board ? <ActivityIndicator color={theme.accent} style={{ marginTop: Spacing.lg }} /> : null}
      {unavailable ? (
        <ThemedText muted>Live scores aren’t available yet. Please check back later.</ThemedText>
      ) : null}

      {(modules.length > 1 || courts.length > 1) && (
        <View style={{ gap: Spacing.sm }}>
          {modules.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="All sports" selected={!module} onPress={() => setModule(null)} />
              {modules.map(([mid, name]) => (
                <Chip key={mid} label={name} selected={module === mid} onPress={() => setModule(module === mid ? null : mid)} />
              ))}
            </ScrollView>
          )}
          {courts.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="All courts" selected={!court} onPress={() => setCourt(null)} />
              {courts.map((c) => (
                <Chip key={c} label={c} selected={court === c} onPress={() => setCourt(court === c ? null : c)} />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {!loading && !unavailable && sortedLive.length === 0 && (
        <View style={styles.empty}>
          <Radio size={44} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">Nothing live right now</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            Matches appear here the moment a referee starts scoring.
          </ThemedText>
        </View>
      )}

      {sortedLive.length > 0 && (
        <View style={styles.grid}>
          {sortedLive.map((m) => (
            <View key={m.match_id} style={styles.cell}>
              <LiveMatchCard m={m} serverOffsetMs={serverOffsetMs} onPress={() => open(m)} />
            </View>
          ))}
        </View>
      )}

      {next.length > 0 && (
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="label" muted>
            Up next
          </ThemedText>
          {next.slice(0, 6).map((m) => (
            <View key={m.match_id} style={[styles.nextRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <ThemedText style={{ fontWeight: '800', minWidth: 64 }}>{m.scheduled_at ? formatClock(m.scheduled_at) : '—'}</ThemedText>
              <View style={{ flex: 1 }}>
                <ThemedText numberOfLines={1} style={{ fontWeight: '700' }}>
                  {m.a?.name ?? 'TBD'} vs {m.b?.name ?? 'TBD'}
                </ThemedText>
                <ThemedText variant="caption" muted numberOfLines={1}>
                  {[matchHeading(m), m.court].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      )}

      {recent.length > 0 && (
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="label" muted>
            Recent results
          </ThemedText>
          <View style={styles.grid}>
            {recent.map((m) => (
              <View key={m.match_id} style={styles.cell}>
                <LiveMatchCard m={m} serverOffsetMs={serverOffsetMs} onPress={() => open(m)} />
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MaxContentWidth * 1.6, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  chips: { gap: Spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  cell: { flexGrow: 1, flexBasis: 320, maxWidth: '100%' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
});
