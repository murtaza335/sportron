import { ChevronDown, ChevronRight, Network } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LeagueTable } from '@/components/tournaments/LeagueTable';
import { TournamentMatchRow } from '@/components/tournaments/TournamentMatchRow';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { moduleScoringMode, pointsHint, tint } from '@/lib/tournamentFormat';
import type { StandingsGroup, TournamentMatch, TournamentModule } from '@/types';

/** Groups + knockout: one card per group (PLAN-v2 §9.6). */
export function ModuleGroupsTab({
  module,
  groups,
  matches,
  viewerId,
  isAdmin,
  groupsFinished,
  onSelectEntry,
  onSelectMatch,
  onBuildKnockout,
}: {
  module: TournamentModule;
  groups: StandingsGroup[];
  matches: TournamentMatch[];
  viewerId: string | undefined;
  isAdmin: boolean;
  groupsFinished: boolean;
  onSelectEntry: (entryId: string) => void;
  onSelectMatch: (match: TournamentMatch) => void;
  onBuildKnockout: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Network size={48} color={theme.textSecondary} strokeWidth={1.5} />
        <ThemedText variant="heading">No groups yet</ThemedText>
        <ThemedText muted style={{ textAlign: 'center' }}>
          Groups are drawn when the fixtures are generated.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      {isAdmin && groupsFinished && module.current_stage === 1 && module.status === 'in_progress' && (
        <View style={[styles.banner, { backgroundColor: tint(theme.success) }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: '700' }}>Group stage complete</ThemedText>
            <ThemedText variant="caption" muted>Set the qualifiers and build the knockout.</ThemedText>
          </View>
          <Button label="Build knockout" onPress={onBuildKnockout} buttonStyle={{ minHeight: 44 }} />
        </View>
      )}

      {groups.map((g) => {
        const gm = matches.filter((x) => x.group_id === g.id || (x.group_letter && x.group_letter === g.letter));
        const expanded = !!open[g.id];
        return (
          <Card key={g.id} style={{ gap: Spacing.sm, padding: Spacing.md }}>
            <View style={styles.head}>
              <ThemedText style={{ fontWeight: '600' }}>{g.name}</ThemedText>
              <ThemedText variant="caption" muted>Top {g.advance} advance</ThemedText>
            </View>
            <LeagueTable
              rows={g.table}
              viewerId={viewerId}
              compact
              hideDraws={!module.allow_draws || moduleScoringMode(module) === 'games'}
              advance={g.advance}
              pointsHint={pointsHint(module)}
              onSelect={onSelectEntry}
            />
            {gm.length > 0 && (
              <>
                <Pressable
                  onPress={() => setOpen((p) => ({ ...p, [g.id]: !expanded }))}
                  style={styles.toggle}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                >
                  {expanded ? (
                    <ChevronDown size={16} color={theme.textSecondary} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={16} color={theme.textSecondary} strokeWidth={2} />
                  )}
                  <ThemedText variant="caption" style={{ fontWeight: '700' }}>Matches ({gm.length})</ThemedText>
                </Pressable>
                {expanded && (
                  <View style={{ gap: Spacing.sm }}>
                    {gm.map((x) => (
                      <TournamentMatchRow key={x.id} match={x} viewerId={viewerId} onPress={() => onSelectMatch(x)} />
                    ))}
                  </View>
                )}
              </>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
});
