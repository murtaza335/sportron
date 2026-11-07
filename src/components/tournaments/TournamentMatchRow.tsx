import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMatchTime, matchStatusLabel } from '@/lib/tournamentFormat';
import type { BracketEntryRef, TournamentMatch } from '@/types';

function Side({
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
    <View style={styles.side}>
      {entry ? (
        <>
          <ThemedText
            numberOfLines={1}
            style={[{ flex: 1, fontWeight: winner ? '700' : '500' }, dim && { color: theme.textSecondary }]}
          >
            {entry.seed != null ? `(${entry.seed}) ` : ''}
            {entry.name}
          </ThemedText>
          {winner && <Check size={14} color={theme.success} strokeWidth={3} />}
          {score != null && (
            <ThemedText style={[styles.score, { fontWeight: winner ? '700' : '500' }, dim && { color: theme.textSecondary }]}>
              {score}
            </ThemedText>
          )}
        </>
      ) : (
        <ThemedText muted style={{ fontStyle: 'italic' }}>{placeholder}</ThemedText>
      )}
    </View>
  );
}

export function TournamentMatchRow({ match, onPress }: { match: TournamentMatch; onPress: () => void }) {
  const theme = useTheme();
  const decided = match.status === 'completed' || match.status === 'walkover';
  const bye = match.status === 'bye';
  const time = formatMatchTime(match.scheduled_at);
  const right = decided || bye
    ? matchStatusLabel(match.status)
    : [time, match.court].filter(Boolean).join(' · ') || 'Upcoming';
  const showScores = match.status === 'completed';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${match.round_name} match ${match.match_number}`}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Side
          entry={match.entry_a}
          score={showScores ? match.score_a : null}
          winner={(decided || bye) && !!match.entry_a && match.winner_entry_id === match.entry_a.id}
          dim={decided && match.winner_entry_id !== match.entry_a?.id}
          placeholder={bye ? 'BYE' : 'TBD'}
        />
        <Side
          entry={match.entry_b}
          score={showScores ? match.score_b : null}
          winner={(decided || bye) && !!match.entry_b && match.winner_entry_id === match.entry_b.id}
          dim={decided && match.winner_entry_id !== match.entry_b?.id}
          placeholder={bye ? 'BYE' : 'TBD'}
        />
      </View>
      <ThemedText variant="caption" muted style={styles.right} numberOfLines={2}>
        {match.is_third_place && !decided ? `3rd place\n${right}` : right}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  side: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { minWidth: 20, textAlign: 'right' },
  right: { maxWidth: 110, textAlign: 'right', fontSize: 11, fontWeight: '600' },
});
