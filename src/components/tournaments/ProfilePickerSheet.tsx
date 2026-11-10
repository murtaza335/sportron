import { Search } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { TextField } from '@/components/tournaments/form';
import { UserAvatar } from '@/components/UserAvatar';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { searchProfilesForTournament } from '@/services/tournaments';
import type { ProfileLite } from '@/types';

/** Search app users by username (RPC is limited to tournament / module admins). */
export function ProfilePickerSheet({
  visible,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSelect: (p: ProfileLite) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible && <PickerBody title={title} onSelect={onSelect} />}
    </BottomSheet>
  );
}

function PickerBody({ title, onSelect }: { title: string; onSelect: (p: ProfileLite) => void }) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await searchProfilesForTournament(q);
        if (!alive) return;
        setResults(r);
        setError(null);
      } catch (e) {
        if (alive) setError(friendlyTournamentError(e));
      } finally {
        if (alive) setLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query]);

  const short = query.trim().length < 2;

  return (
    <View style={{ gap: Spacing.sm, minHeight: 260 }}>
      <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>{title}</ThemedText>
      <View style={styles.searchRow}>
        <Search size={18} color={theme.textSecondary} strokeWidth={2} />
        <TextField
          value={query}
          onChangeText={setQuery}
          placeholder="Search username"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          style={{ flex: 1 }}
        />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 320 }}>
        {loading ? (
          <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.md }} />
        ) : error ? (
          <ThemedText variant="caption" style={{ color: theme.error }}>{error}</ThemedText>
        ) : short ? (
          <ThemedText variant="caption" muted>Type at least 2 letters.</ThemedText>
        ) : results.length === 0 ? (
          <ThemedText variant="caption" muted>No users found.</ThemedText>
        ) : (
          results.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => onSelect(p)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Select ${p.username}`}
            >
              <UserAvatar avatarUrl={p.avatar_url} size={36} />
              <ThemedText style={{ fontWeight: '600' }}>@{p.username}</ThemedText>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.sm },
});
