import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatClock, slotPlaceholder } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { TournamentScheduleMatch } from '@/types';

const COLLAPSED_COUNT = 5;

function sides(m: TournamentScheduleMatch): string {
  const a = m.entry_a?.name ?? slotPlaceholder(m.entry_a_label, false);
  const b = m.entry_b?.name ?? slotPlaceholder(m.entry_b_label, false);
  return `${a} vs ${b}`;
}

function result(m: TournamentScheduleMatch): string | null {
  if (m.status === 'walkover') return 'W/O';
  if (m.status !== 'completed') return null;
  if (m.is_draw) return 'Draw';
  return m.score_a != null && m.score_b != null ? `${m.score_a}–${m.score_b}` : 'Final';
}

/** Matches scheduled for today across all modules; "See all" expands the full list grouped by module. */
export function TodayMatchesSection({
  tournamentId,
  matches,
  viewerId,
}: {
  tournamentId: string;
  matches: TournamentScheduleMatch[];
  viewerId?: string;
}) {
  const theme = useTheme();
  const router = useRouter();
  const [all, setAll] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);

  const isMine = (m: TournamentScheduleMatch) =>
    !!viewerId &&
    (!!m.entry_a?.profile_ids.includes(viewerId) || !!m.entry_b?.profile_ids.includes(viewerId));
  const hasMine = useMemo(() => matches.some(isMine), [matches, viewerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = mineOnly ? matches.filter(isMine) : matches;
  const visible = all ? shown : shown.slice(0, COLLAPSED_COUNT);

  const byModule = useMemo(() => {
    if (!all) return null;
    const groups = new Map<string, { name: string; order: number; items: TournamentScheduleMatch[] }>();
    for (const m of shown) {
      const g = groups.get(m.module_id) ?? { name: m.module_name, order: m.module_sort_order, items: [] };
      g.items.push(m);
      groups.set(m.module_id, g);
    }
    return [...groups.entries()].sort((a, b) => a[1].order - b[1].order);
  }, [all, shown]);

  if (matches.length === 0) return null;

  const row = (m: TournamentScheduleMatch, showModule: boolean) => {
    const res = result(m);
    const right = res ?? [formatClock(m.scheduled_at), m.court].filter(Boolean).join(' · ');
    return (
      <Pressable
        key={m.id}
        onPress={() => router.push(tournamentRoutes.moduleMatches(tournamentId, m.module_id))}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: theme.backgroundElement, borderColor: isMine(m) ? theme.accent : theme.border },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${sides(m)}, ${right}`}
      >
        <View style={{ flex: 1, gap: 2 }}>
          {showModule && (
            <ThemedText variant="caption" muted numberOfLines={1}>{m.module_name}</ThemedText>
          )}
          <ThemedText numberOfLines={1} style={{ fontWeight: isMine(m) ? '700' : '500' }}>{sides(m)}</ThemedText>
        </View>
        <ThemedText variant="caption" muted style={styles.right} numberOfLines={2}>
          {right}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <ThemedText variant="label" muted>Today’s matches</ThemedText>
        <ThemedText variant="label" muted>{shown.length}</ThemedText>
      </View>

      {hasMine && (
        <View style={styles.chips}>
          {[false, true].map((mine) => {
            const sel = mineOnly === mine;
            return (
              <Pressable
                key={String(mine)}
                onPress={() => setMineOnly(mine)}
                style={[
                  styles.chip,
                  { borderColor: theme.border },
                  sel && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
              >
                <ThemedText variant="caption" style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
                  {mine ? 'My matches' : 'All'}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {byModule ? (
        byModule.map(([moduleId, g]) => (
          <View key={moduleId} style={{ gap: Spacing.sm }}>
            <ThemedText variant="caption" muted style={{ fontWeight: '700' }}>{g.name}</ThemedText>
            {g.items.map((m) => row(m, false))}
          </View>
        ))
      ) : (
        <View style={{ gap: Spacing.sm }}>{visible.map((m) => row(m, true))}</View>
      )}

      {shown.length === 0 && (
        <ThemedText muted variant="caption">None of today’s matches are yours.</ThemedText>
      )}

      {shown.length > COLLAPSED_COUNT && (
        <Pressable onPress={() => setAll((v) => !v)} hitSlop={8} accessibilityRole="button">
          <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
            {all ? 'Show less' : `See all ${shown.length}`}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chips: { flexDirection: 'row', gap: Spacing.sm },
  chip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  right: { maxWidth: 110, textAlign: 'right', fontSize: 11, fontWeight: '600' },
});
