import { Swords } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { TournamentMatchRow } from '@/components/tournaments/TournamentMatchRow';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { roundHeader } from '@/lib/tournamentFormat';
import type { TournamentMatch } from '@/types';

type Filter = 'all' | 'upcoming' | 'results';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'results', label: 'Results' },
];

export function ModuleMatchesTab({
  matches,
  onSelect,
}: {
  matches: TournamentMatch[];
  onSelect: (m: TournamentMatch) => void;
}) {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('all');

  const sections = useMemo(() => {
    const visible = matches.filter((m) => {
      if (m.status === 'bye') return filter === 'all';
      const decided = m.status === 'completed' || m.status === 'walkover';
      if (filter === 'upcoming') return !decided;
      if (filter === 'results') return decided;
      return true;
    });
    const groups = new Map<string, { key: string; title: string; order: number; items: TournamentMatch[] }>();
    for (const m of visible) {
      const key = `${m.round_number}-${m.is_third_place ? 't' : 'm'}`;
      const g = groups.get(key) ?? {
        key,
        title: roundHeader(m.round_name, m.best_of),
        order: m.round_number * 2 + (m.is_third_place ? 1 : 0),
        items: [],
      };
      g.items.push(m);
      groups.set(key, g);
    }
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ ...g, items: g.items.sort((a, b) => a.match_number - b.match_number) }));
  }, [matches, filter]);

  return (
    <View style={{ gap: Spacing.md }}>
      <View style={styles.chips}>
        {FILTERS.map((f) => {
          const sel = f.value === filter;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFilter(f.value)}
              style={[
                styles.chip,
                { borderColor: theme.border },
                sel && { backgroundColor: theme.text, borderColor: theme.text },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: sel }}
            >
              <ThemedText variant="caption" numberOfLines={1} style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
                {f.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Swords size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">{matches.length === 0 ? 'No matches yet' : 'Nothing here'}</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            {matches.length === 0 ? 'Matches appear once the bracket is generated.' : 'Try another filter.'}
          </ThemedText>
        </View>
      ) : (
        sections.map((s) => (
          <View key={s.key} style={{ gap: Spacing.sm }}>
            <ThemedText variant="label" muted>{s.title}</ThemedText>
            {s.items.map((m) => (
              <TournamentMatchRow key={m.id} match={m} onPress={() => onSelect(m)} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.sm },
  chip: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
});
