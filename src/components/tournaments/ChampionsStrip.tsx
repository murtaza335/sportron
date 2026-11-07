import { Trophy } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { InfoPill } from '@/components/tournaments/StatusPill';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sportLabel } from '@/lib/tournamentFormat';
import type { TournamentChampion } from '@/types';

/** Horizontal strip of module champions, shown above the module list (PLAN §12.3). */
export function ChampionsStrip({
  champions,
  onPressChampion,
}: {
  champions: TournamentChampion[];
  onPressChampion?: (moduleId: string) => void;
}) {
  const theme = useTheme();
  if (champions.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {champions.map((c) => (
        <Pressable
          key={c.module_id}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            pressed && { opacity: 0.8 },
          ]}
          onPress={() => onPressChampion?.(c.module_id)}
          accessibilityRole="button"
          accessibilityLabel={`${c.module_name} champion ${c.champion?.name ?? ''}`}
        >
          <View style={styles.head}>
            <Trophy size={20} color={theme.warning} strokeWidth={2} />
            <InfoPill label={sportLabel(c.sport)} />
          </View>
          <ThemedText variant="caption" muted numberOfLines={1}>
            {c.module_name}
          </ThemedText>
          <ThemedText variant="body" style={styles.champ} numberOfLines={1}>
            {c.champion?.name ?? '—'}
          </ThemedText>
          {c.runner_up && (
            <ThemedText variant="caption" muted numberOfLines={1}>
              2nd {c.runner_up.name}
            </ThemedText>
          )}
          {c.third && (
            <ThemedText variant="caption" muted numberOfLines={1}>
              3rd {c.third.name}
            </ThemedText>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.sm, paddingRight: Spacing.md },
  card: {
    width: 200,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    gap: 2,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  champ: { fontWeight: '700' },
});
