import { Trophy } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tint } from '@/lib/tournamentFormat';
import type { TournamentStanding } from '@/types';

const ROW_H = 48;
const RANK_W = 44;
const ENTRY_W = 150;
const STAT_W = 40;
const REACHED_W = 108;

function Header({ children, w, align = 'center' }: { children: string; w?: number; align?: 'left' | 'center' }) {
  return (
    <View style={{ width: w, justifyContent: 'center', height: 36 }}>
      <ThemedText variant="caption" muted style={{ fontWeight: '700', textAlign: align }}>{children}</ThemedText>
    </View>
  );
}

export function StandingsTable({
  standings,
  viewerId,
  ownEntryIds,
  onSelect,
}: {
  standings: TournamentStanding[];
  viewerId: string | undefined;
  /** Entries the viewer plays in (own entry or team member). */
  ownEntryIds?: Set<string>;
  onSelect: (entryId: string) => void;
}) {
  const theme = useTheme();
  const rowBg = (s: TournamentStanding) =>
    s.status === 'champion'
      ? tint(theme.warning)
      : (viewerId && s.profile_id === viewerId) || ownEntryIds?.has(s.entry_id)
        ? theme.backgroundSelected
        : 'transparent';
  const dim = (s: TournamentStanding) => s.status === 'eliminated' || s.status === 'withdrawn';

  return (
    <View>
      <View style={[styles.table, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {/* pinned: # and Entry */}
        <View>
          <View style={[styles.headRow, { borderColor: theme.border }]}>
            <Header w={RANK_W}>#</Header>
            <Header w={ENTRY_W} align="left">Entry</Header>
          </View>
          {standings.map((s) => (
            <Pressable
              key={s.entry_id}
              onPress={() => onSelect(s.entry_id)}
              style={[styles.row, { backgroundColor: rowBg(s), borderColor: theme.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${s.name}, rank ${s.rank_label}`}
            >
              <View style={{ width: RANK_W, alignItems: 'center' }}>
                <ThemedText variant="caption" style={{ fontWeight: '700' }}>{s.rank_label}</ThemedText>
              </View>
              <View style={[styles.entryCell, { width: ENTRY_W }]}>
                {s.status === 'champion' && <Trophy size={14} color={theme.warning} strokeWidth={2} />}
                <ThemedText
                  numberOfLines={1}
                  style={[{ fontWeight: '600', flexShrink: 1 }, dim(s) && { color: theme.textSecondary }]}
                >
                  {s.name}
                </ThemedText>
                {s.status === 'alive' && <View style={[styles.dot, { backgroundColor: theme.success }]} />}
              </View>
            </Pressable>
          ))}
        </View>

        {/* scrollable stats */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View>
            <View style={[styles.headRow, { borderColor: theme.border }]}>
              <Header w={STAT_W}>P</Header>
              <Header w={STAT_W}>W</Header>
              <Header w={STAT_W}>L</Header>
              <Header w={STAT_W + 8}>+/-</Header>
              <Header w={REACHED_W} align="left">Reached</Header>
            </View>
            {standings.map((s) => (
              <Pressable
                key={s.entry_id}
                onPress={() => onSelect(s.entry_id)}
                style={[styles.row, { backgroundColor: rowBg(s), borderColor: theme.border }]}
              >
                {[s.played, s.won, s.lost].map((v, i) => (
                  <View key={i} style={{ width: STAT_W, alignItems: 'center' }}>
                    <ThemedText variant="caption" style={dim(s) ? { color: theme.textSecondary } : undefined}>{v}</ThemedText>
                  </View>
                ))}
                <View style={{ width: STAT_W + 8, alignItems: 'center' }}>
                  <ThemedText variant="caption" style={dim(s) ? { color: theme.textSecondary } : undefined}>
                    {s.score_diff > 0 ? `+${s.score_diff}` : s.score_diff}
                  </ThemedText>
                </View>
                <View style={{ width: REACHED_W }}>
                  <ThemedText variant="caption" numberOfLines={1} style={dim(s) ? { color: theme.textSecondary } : undefined}>
                    {s.status === 'withdrawn' ? 'Withdrawn' : (s.reached_label ?? '—')}
                  </ThemedText>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      <ThemedText variant="caption" muted style={{ marginTop: Spacing.xs }}>
        P played · W won · L lost · +/- score difference
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  table: { flexDirection: 'row', borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  headRow: { flexDirection: 'row', height: 36, borderBottomWidth: 1 },
  row: { flexDirection: 'row', alignItems: 'center', height: ROW_H, borderBottomWidth: StyleSheet.hairlineWidth },
  entryCell: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: Spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
