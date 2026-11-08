import { Search, TriangleAlert, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { ThemedText } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { entryNoun, isDoubles, pairLine } from '@/lib/tournamentFormat';
import type { TournamentEntry, TournamentEntryField, TournamentModule } from '@/types';

/** Public one-line summary: school + other public custom fields. */
function summary(entry: TournamentEntry, fields: TournamentEntryField[]): string {
  return fields
    .filter((f) => f.key !== 'name' && (f.is_public || f.key === 'school'))
    .map((f) => entry.fields[f.key])
    .filter((v): v is string => !!v)
    .join(' · ');
}

/** Public school line of a doubles pair: both schools, deduped. */
function pairSchools(entry: TournamentEntry): string {
  return [...new Set(entry.members.map((m) => m.fields.school).filter((v): v is string => !!v))].join(' / ');
}

export function ModuleEntriesTab({
  module,
  isAdmin,
  entries,
  fields,
  canAdd,
  onAdd,
  onSelect,
}: {
  module: Pick<TournamentModule, 'participant_type' | 'roster_min' | 'roster_max'>;
  isAdmin: boolean;
  entries: TournamentEntry[];
  fields: TournamentEntryField[];
  canAdd: boolean;
  onAdd: () => void;
  onSelect: (entry: TournamentEntry) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        summary(e, fields).toLowerCase().includes(q) ||
        e.members.some((m) => m.name.toLowerCase().includes(q)),
    );
  }, [entries, fields, query]);
  const isTeam = module.participant_type === 'team';
  const doubles = isDoubles(module);
  const noun = entryNoun(module, true);
  const min = module.roster_min ?? 0;

  const activeCount = entries.filter((e) => e.status === 'active').length;

  return (
    <View style={styles.wrap}>
      <View style={[styles.search, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
        <Search size={16} color={theme.textSecondary} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={isTeam ? `Search ${doubles ? "pair" : "team"} or player name` : "Search name or school"}
          placeholderTextColor={theme.placeholder}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ThemedText variant="caption" muted>
        {activeCount} {activeCount === 1 ? entryNoun(module) : noun}
      </ThemedText>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Users size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">No {isTeam ? noun : 'entries'} yet</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            {canAdd ? `Add the first ${entryNoun(module)} to get started.` : 'Entries will appear here once added.'}
          </ThemedText>
        </View>
      ) : filtered.length === 0 ? (
        <ThemedText muted style={{ textAlign: 'center', marginTop: Spacing.md }}>No matches for “{query}”</ThemedText>
      ) : (
        <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {filtered.map((e, i) => {
            const out = e.status === 'withdrawn' ? 'WITHDRAWN' : e.eliminated_round != null || e.final_rank != null ? 'OUT' : null;
            const captain = e.members.find((m) => m.is_captain);
            const incomplete = isAdmin && isTeam && e.status === 'active' && e.member_count < min;
            const sub = isTeam
              ? doubles
                ? pairSchools(e)
                : captain
                  ? `Captain: ${captain.name}`
                  : ''
              : summary(e, fields);
            const title = doubles && e.members.length > 0 ? pairLine(e.members) : e.name;
            return (
              <Pressable
                key={e.id}
                onPress={() => onSelect(e)}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Entry ${e.name}`}
              >
                <View style={[styles.seed, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText variant="caption" style={{ fontWeight: '700' }}>{e.seed ?? '–'}</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>{title}</ThemedText>
                  {sub ? <ThemedText variant="caption" muted numberOfLines={1}>{sub}</ThemedText> : null}
                </View>
                {out && (
                  <ThemedText
                    variant="caption"
                    style={{ fontSize: 10, fontWeight: '700', color: out === 'WITHDRAWN' ? theme.error : theme.textSecondary }}
                  >
                    {out}
                  </ThemedText>
                )}
                {incomplete && (
                  <View style={[styles.warn, { backgroundColor: tintWarn(theme.warning) }]}>
                    <TriangleAlert size={11} color={theme.warning} strokeWidth={2.5} />
                    <ThemedText variant="caption" style={{ fontSize: 10, fontWeight: '700', color: theme.warning }}>
                      {e.member_count}/{min}
                    </ThemedText>
                  </View>
                )}
                {isTeam && !doubles && (
                  <View style={styles.count}>
                    <Users size={12} color={theme.textSecondary} strokeWidth={2} />
                    <ThemedText variant="caption" muted>{e.member_count}</ThemedText>
                  </View>
                )}
                {e.profile && <UserAvatar avatarUrl={e.profile.avatar_url} size={24} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {canAdd && <Button label={isTeam ? `Add ${doubles ? "pair" : "team"}` : "Add entry"} variant="secondary" onPress={onAdd} />}
    </View>
  );
}

const tintWarn = (c: string) => (/^#[0-9a-fA-F]{6}$/.test(c) ? `${c}26` : c);

const styles = StyleSheet.create({
  warn: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: Radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  count: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  wrap: { gap: Spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md },
  searchInput: { flex: 1, fontSize: 16, lineHeight: 24, paddingVertical: Spacing.sm },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  seed: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
});
