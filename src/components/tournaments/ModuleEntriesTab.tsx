import { Search, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { ThemedText } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TournamentEntry, TournamentEntryField } from '@/types';

/** Public one-line summary: school + other public custom fields. */
function summary(entry: TournamentEntry, fields: TournamentEntryField[]): string {
  return fields
    .filter((f) => f.key !== 'name' && (f.is_public || f.key === 'school'))
    .map((f) => entry.fields[f.key])
    .filter((v): v is string => !!v)
    .join(' · ');
}

export function ModuleEntriesTab({
  entries,
  fields,
  canAdd,
  onAdd,
  onSelect,
}: {
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
      (e) => e.name.toLowerCase().includes(q) || summary(e, fields).toLowerCase().includes(q),
    );
  }, [entries, fields, query]);

  const activeCount = entries.filter((e) => e.status === 'active').length;

  return (
    <View style={styles.wrap}>
      <View style={[styles.search, { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder }]}>
        <Search size={16} color={theme.textSecondary} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search name or school"
          placeholderTextColor={theme.placeholder}
          style={[styles.searchInput, { color: theme.text }]}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>
      <ThemedText variant="caption" muted>
        {activeCount} {activeCount === 1 ? 'entry' : 'entries'}
      </ThemedText>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Users size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">No entries yet</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            {canAdd ? 'Add the first entry to get started.' : 'Entries will appear here once added.'}
          </ThemedText>
        </View>
      ) : filtered.length === 0 ? (
        <ThemedText muted style={{ textAlign: 'center', marginTop: Spacing.md }}>No matches for “{query}”</ThemedText>
      ) : (
        <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {filtered.map((e, i) => {
            const out = e.status === 'withdrawn' ? 'WITHDRAWN' : e.eliminated_round != null || e.final_rank != null ? 'OUT' : null;
            const sub = summary(e, fields);
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
                  <ThemedText style={{ fontWeight: '600' }} numberOfLines={1}>{e.name}</ThemedText>
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
                {e.profile && <UserAvatar avatarUrl={e.profile.avatar_url} size={24} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {canAdd && <Button label="Add entry" variant="secondary" onPress={onAdd} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md },
  searchInput: { flex: 1, fontSize: 16, lineHeight: 24, paddingVertical: Spacing.sm },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  seed: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
});
