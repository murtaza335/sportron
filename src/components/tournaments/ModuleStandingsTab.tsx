import { ListOrdered } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StandingsChart } from '@/components/tournaments/StandingsChart';
import { StandingsTable } from '@/components/tournaments/StandingsTable';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TournamentRound, TournamentStanding } from '@/types';

type View_ = 'table' | 'chart';

export function ModuleStandingsTab({
  standings,
  rounds,
  viewerId,
  ownEntryIds,
  onSelectEntry,
}: {
  standings: TournamentStanding[];
  rounds: TournamentRound[];
  viewerId: string | undefined;
  ownEntryIds?: Set<string>;
  onSelectEntry: (entryId: string) => void;
}) {
  const theme = useTheme();
  const [view, setView] = useState<View_>('table');

  if (standings.length === 0) {
    return (
      <View style={styles.empty}>
        <ListOrdered size={48} color={theme.textSecondary} strokeWidth={1.5} />
        <ThemedText variant="heading">No standings yet</ThemedText>
        <ThemedText muted style={{ textAlign: 'center' }}>Standings appear once the bracket is generated.</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.md }}>
      <SegmentedControl
        compact
        value={view}
        onChange={setView}
        options={[
          { value: 'table', label: 'Table' },
          { value: 'chart', label: 'Chart' },
        ]}
      />
      {view === 'table' ? (
        <StandingsTable standings={standings} viewerId={viewerId} ownEntryIds={ownEntryIds} onSelect={onSelectEntry} />
      ) : (
        <StandingsChart standings={standings} rounds={rounds} onSelect={onSelectEntry} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: Spacing.sm, marginVertical: Spacing.xl },
});
