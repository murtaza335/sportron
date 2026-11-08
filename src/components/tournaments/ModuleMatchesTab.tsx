import { Swords } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TournamentMatchRow } from '@/components/tournaments/TournamentMatchRow';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { matchSectionKey, matchSectionOrder, matchSectionTitle } from '@/lib/tournamentFormat';
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
  viewerId,
}: {
  matches: TournamentMatch[];
  onSelect: (m: TournamentMatch) => void;
  viewerId?: string;
}) {
  const theme = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const groupLetters = useMemo(
    () => [...new Set(matches.map((m) => m.group_letter).filter((l): l is string => !!l))].sort(),
    [matches],
  );

  const sections = useMemo(() => {
    const visible = matches.filter((m) => {
      if (groupFilter !== 'all' && m.group_letter !== groupFilter) return false;
      if (m.status === 'bye') return filter === 'all';
      const decided = m.status === 'completed' || m.status === 'walkover';
      if (filter === 'upcoming') return !decided;
      if (filter === 'results') return decided;
      return true;
    });
    const groups = new Map<string, { key: string; title: string; order: number; items: TournamentMatch[] }>();
    for (const m of visible) {
      const key = matchSectionKey(m);
      const g = groups.get(key) ?? {
        key,
        title: matchSectionTitle(m),
        order: matchSectionOrder(m),
        items: [],
      };
      g.items.push(m);
      groups.set(key, g);
    }
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .map((g) => ({ ...g, items: g.items.sort((a, b) => a.match_number - b.match_number) }));
  }, [matches, filter, groupFilter]);

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

      {groupLetters.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {['all', ...groupLetters].map((l) => {
            const sel = l === groupFilter;
            return (
              <Pressable
                key={l}
                onPress={() => setGroupFilter(l)}
                style={[
                  styles.chip,
                  { borderColor: theme.border },
                  sel && { backgroundColor: theme.text, borderColor: theme.text },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: sel }}
              >
                <ThemedText variant="caption" style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
                  {l === 'all' ? 'All groups' : `Group ${l}`}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {sections.length === 0 ? (
        <View style={styles.empty}>
          <Swords size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">{matches.length === 0 ? 'No matches yet' : 'Nothing here'}</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            {matches.length === 0 ? 'Matches appear once the fixtures are generated.' : 'Try another filter.'}
          </ThemedText>
        </View>
      ) : (
        sections.map((s) => (
          <View key={s.key} style={{ gap: Spacing.sm }}>
            <ThemedText variant="label" muted>{s.title}</ThemedText>
            {s.items.map((m) => (
              <TournamentMatchRow key={m.id} match={m} onPress={() => onSelect(m)} viewerId={viewerId} />
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
