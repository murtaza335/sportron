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
  guestName: string;
  onSelectProfile: (profile: Profile | null) => void;
  onGuestNameChange: (name: string) => void;
};

export function OpponentSelector({
  profiles,
  selectedId,
  guestName,
  onSelectProfile,
  onGuestNameChange,
}: OpponentSelectorProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [useGuest, setUseGuest] = useState(Boolean(guestName));

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return profiles;
    }
    return profiles.filter((profile) =>
      profile.username.toLowerCase().includes(normalized),
    );
  }, [profiles, query]);

  const handleGuestToggle = () => {
    setUseGuest(true);
    onSelectProfile(null);
  };

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
        ListHeaderComponent={
          <Pressable
            onPress={handleGuestToggle}
            style={[
              styles.row,
              { borderColor: theme.border },
              useGuest && !selectedId && { backgroundColor: theme.backgroundElement },
            ]}>
            <ThemedText variant="body" style={{ fontWeight: '600' }}>
              Guest player
            </ThemedText>
            {useGuest && !selectedId ? <Check size={18} color={theme.text} /> : null}
          </Pressable>
        }
        renderItem={({ item }) => {
          const selected = selectedId === item.id;
          return (
            <Pressable
              onPress={() => {
                setUseGuest(false);
                onSelectProfile(item);
              }}
              style={[
                styles.row,
                { borderColor: theme.border },
                selected && { backgroundColor: theme.backgroundElement },
              ]}>
              <View>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {item.username}
                </ThemedText>
                <ThemedText variant="caption" muted>
                  {item.role}
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

      {(useGuest || guestName) && !selectedId ? (
        <TextInput
          value={guestName}
          onChangeText={onGuestNameChange}
          placeholder="Enter guest player name"
          placeholderTextColor={theme.textSecondary}
          style={[
            styles.guestInput,
            {
              color: theme.text,
              borderColor: theme.border,
              backgroundColor: theme.background,
            },
          ]}
        />
      ) : null}
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
  guestInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  empty: {
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },
});
