import { useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { InfoPill, RoleTag, StatusPill } from '@/components/tournaments/StatusPill';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMatchTime, moduleStatusTone, roleTag, sportLabel } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { TournamentModuleSummary } from '@/types';

export function ModuleCard({
  tournamentId,
  module,
}: {
  tournamentId: string;
  module: TournamentModuleSummary;
}) {
  const theme = useTheme();
  const router = useRouter();
  const role = roleTag(module.my_role);
  const when = formatMatchTime(module.starts_at);
  const sub = [
    `${module.entry_count} ${module.entry_count === 1 ? 'entry' : 'entries'}`,
    module.current_round_name ?? (module.status === 'open' && when ? `starts ${when}` : null),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => router.push(tournamentRoutes.module(tournamentId, module.id))}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open module ${module.name}`}
    >
      <Card style={styles.card}>
        <View style={styles.top}>
          <InfoPill label={sportLabel(module.sport, module.custom_sport_name)} />
          <StatusPill tone={moduleStatusTone(module.status)} />
        </View>
        <ThemedText variant="body" style={styles.name} numberOfLines={2}>
          {module.name}
        </ThemedText>
        <ThemedText variant="caption" muted>
          {sub}
        </ThemedText>
        {(module.venue || role) && (
          <View style={styles.bottom}>
            {module.venue ? (
              <View style={styles.venue}>
                <MapPin size={12} color={theme.textSecondary} strokeWidth={2} />
                <ThemedText variant="caption" muted numberOfLines={1} style={{ fontSize: 11 }}>
                  {module.venue}
                </ThemedText>
              </View>
            ) : (
              <View />
            )}
            {role && <RoleTag label={role} />}
          </View>
        )}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.xs },
  name: { fontWeight: '600' },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.xs },
  venue: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 1 },
});
