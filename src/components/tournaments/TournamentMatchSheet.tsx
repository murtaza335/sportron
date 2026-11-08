import { Check } from 'lucide-react-native';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { bestOfLabel, formatMatchTime, matchStatusLabel, matchTitle, slotPlaceholder } from '@/lib/tournamentFormat';
import type { BracketEntryRef, TournamentMatch } from '@/types';

function EntryLine({
  entry,
  score,
  winner,
  dim,
  placeholder,
}: {
  entry: BracketEntryRef | null;
  score: number | null;
  winner: boolean;
  dim: boolean;
  placeholder: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.entryLine}>
      <ThemedText
        variant="body"
        numberOfLines={1}
        style={[{ flex: 1, fontWeight: winner ? '700' : '500' }, !entry && { fontStyle: 'italic' }, (dim || !entry) && { color: theme.textSecondary }]}
      >
        {entry ? `${entry.seed != null ? `(${entry.seed}) ` : ''}${entry.name}` : placeholder}
      </ThemedText>
      {winner && <Check size={16} color={theme.success} strokeWidth={3} />}
      {score != null && (
        <ThemedText variant="heading" style={[{ fontSize: 20, minWidth: 24, textAlign: 'right' }, dim && { color: theme.textSecondary }]}>
          {score}
        </ThemedText>
      )}
    </View>
  );
}

/** Read-only match detail. Admin actions are passed via `footer` (step 20). */
export function TournamentMatchSheet({
  match,
  allMatches,
  onClose,
  footer,
}: {
  match: TournamentMatch | null;
  allMatches: TournamentMatch[];
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const theme = useTheme();
  const decided = match ? match.status === 'completed' || match.status === 'walkover' : false;
  const next = match?.next_match_id ? allMatches.find((m) => m.id === match.next_match_id) : null;
  const winner =
    match?.winner_entry_id === match?.entry_a?.id
      ? match?.entry_a
      : match?.winner_entry_id === match?.entry_b?.id
        ? match?.entry_b
        : null;
  const when = match ? formatMatchTime(match.scheduled_at) : null;
  const where = match ? [match.venue, match.court].filter(Boolean).join(' · ') : '';
  const games = match?.score_detail?.length ? match.score_detail.map((g) => `${g.a}-${g.b}`).join(' · ') : null;

  return (
    <BottomSheet visible={!!match} onClose={onClose}>
      {match && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
            {match.group_letter ? `Group ${match.group_letter} · ` : ''}{matchTitle(match)} · {bestOfLabel(match.best_of)}
          </ThemedText>
          <ThemedText variant="caption" muted>
            {[match.is_draw ? 'Draw' : matchStatusLabel(match.status), when, where].filter(Boolean).join(' · ')}
          </ThemedText>

          <View style={[styles.box, { borderColor: theme.border }]}>
            <EntryLine
              entry={match.entry_a}
              score={match.status === 'completed' ? match.score_a : null}
              winner={decided && !!match.entry_a && match.winner_entry_id === match.entry_a.id}
              dim={decided && !match.is_draw && match.winner_entry_id !== match.entry_a?.id}
              placeholder={slotPlaceholder(match.entry_a_label, match.status === 'bye')}
            />
            <EntryLine
              entry={match.entry_b}
              score={match.status === 'completed' ? match.score_b : null}
              winner={decided && !!match.entry_b && match.winner_entry_id === match.entry_b.id}
              dim={decided && !match.is_draw && match.winner_entry_id !== match.entry_b?.id}
              placeholder={slotPlaceholder(match.entry_b_label, match.status === 'bye')}
            />
          </View>

          {games && <ThemedText variant="caption" muted>{games}</ThemedText>}
          {match.status === 'walkover' && (
            <ThemedText variant="caption" muted>Walkover</ThemedText>
          )}
          {match.result_note && match.result_note !== 'Walkover' && (
            <ThemedText variant="caption" muted>{match.result_note}</ThemedText>
          )}
          {decided && winner && next && (
            <ThemedText variant="caption">
              {winner.name} advances to the {next.round_name}
            </ThemedText>
          )}

          {footer}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.sm, paddingBottom: Spacing.md },
  box: { borderWidth: 1, borderRadius: 12, padding: Spacing.md, gap: Spacing.sm },
  entryLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
