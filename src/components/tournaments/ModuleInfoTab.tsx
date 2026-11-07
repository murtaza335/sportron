import { StyleSheet, View } from 'react-native';

import { UserAvatar } from '@/components/UserAvatar';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { bestOfLabel, formatMatchTime } from '@/lib/tournamentFormat';
import type { ProfileLite, TournamentModule, TournamentRound } from '@/types';

export function ModuleInfoTab({
  module,
  rounds,
  admins,
}: {
  module: TournamentModule;
  rounds: TournamentRound[];
  admins: ProfileLite[];
}) {
  const format = `Single elimination${module.third_place_match ? ' · 3rd-place match on' : ''}`;
  return (
    <View style={styles.wrap}>
      {module.description && (
        <View style={styles.block}>
          <ThemedText variant="label" muted>About</ThemedText>
          <ThemedText muted>{module.description}</ThemedText>
        </View>
      )}
      {module.rules_text && (
        <View style={styles.block}>
          <ThemedText variant="label" muted>Rules</ThemedText>
          <ThemedText muted>{module.rules_text}</ThemedText>
        </View>
      )}
      <View style={styles.block}>
        <ThemedText variant="label" muted>Format</ThemedText>
        <ThemedText>{format}</ThemedText>
        {module.max_entries != null && (
          <ThemedText variant="caption" muted>Up to {module.max_entries} entries</ThemedText>
        )}
      </View>

      {rounds.length > 0 && (
        <View style={styles.block}>
          <ThemedText variant="label" muted>Rounds</ThemedText>
          <Card style={{ gap: Spacing.sm }}>
            {rounds.map((r) => (
              <View key={r.id} style={styles.round}>
                <ThemedText style={{ fontWeight: '600' }}>{r.name}</ThemedText>
                <ThemedText variant="caption" muted>
                  {[bestOfLabel(r.best_of), formatMatchTime(r.scheduled_start)].filter(Boolean).join(' · ')}
                </ThemedText>
                {r.rules_text && <ThemedText variant="caption" muted>{r.rules_text}</ThemedText>}
              </View>
            ))}
          </Card>
        </View>
      )}

      {admins.length > 0 && (
        <View style={styles.block}>
          <ThemedText variant="label" muted>Module admins</ThemedText>
          <View style={styles.admins}>
            {admins.map((a) => (
              <View key={a.id} style={styles.admin}>
                <UserAvatar avatarUrl={a.avatar_url} size={24} />
                <ThemedText variant="caption">{a.username}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  block: { gap: Spacing.xs },
  round: { gap: 2 },
  admins: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
