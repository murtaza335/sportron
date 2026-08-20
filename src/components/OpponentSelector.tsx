import { Check, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Profile } from '@/types';

type OpponentSelectorProps = {
  profiles: Profile[];
  selectedId: string | null;
  onSelectProfile: (profile: Profile | null) => void;
};

export function OpponentSelector({
  profiles,
  selectedId,
  onSelectProfile,
}: OpponentSelectorProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return profiles;
    }
    return profiles.filter((profile) =>
      profile.username.toLowerCase().includes(normalized),
    );
  }, [profiles, query]);

  return (
    <View style={styles.container}>
      <ThemedText variant="label" muted>
        Opponent
      </ThemedText>

      <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Search size={18} color={theme.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search players..."
          placeholderTextColor={theme.textSecondary}
          style={[styles.searchInput, { color: theme.text }]}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const selected = selectedId === item.id;
          return (
            <Pressable
              onPress={() => onSelectProfile(item)}
              style={[
                styles.row,
                { borderColor: theme.border },
                selected && { backgroundColor: theme.backgroundElement },
              ]}>
              <View>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {item.username}
                </ThemedText>
              </View>
              {selected ? <Check size={18} color={theme.text} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <ThemedText variant="caption" muted style={styles.empty}>
            No players found
          </ThemedText>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: Spacing.sm,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
  },
  list: {
    maxHeight: 220,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: 1,
  },
  empty: {
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },
});
