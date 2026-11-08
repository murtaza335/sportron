import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius } from '@/constants/theme';
import { NODE_H, NODE_W } from '@/lib/bracketLayout';
import { formatMatchTime, slotPlaceholder } from '@/lib/tournamentFormat';
import { useTheme } from '@/hooks/use-theme';
import type { BracketEntryRef, TournamentMatch } from '@/types';

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.toDateString() === new Date().toDateString();
}

function Row({
  entry,
  score,
  winner,
  decided,
  mine,
  bye,
  placeholder,
}: {
  entry: BracketEntryRef | null;
  score: number | null;
  winner: boolean;
  decided: boolean;
  mine: boolean;
  bye: boolean;
  placeholder: string;
}) {
  const theme = useTheme();
  const loser = decided && !winner;
  return (
    <View style={styles.row}>
      {entry ? (
        <>
          {entry.seed != null && (
            <ThemedText variant="caption" muted style={styles.seed}>({entry.seed})</ThemedText>
          )}
          <ThemedText
            variant="caption"
            numberOfLines={1}
            style={[
              styles.name,
              winner && { fontWeight: '700' },
              loser && { color: theme.textSecondary },
              mine && { color: theme.accent },
            ]}
          >
            {entry.name}
          </ThemedText>
          {winner && !bye && <Check size={12} color={theme.success} strokeWidth={3} />}
          {score != null && (
            <ThemedText variant="caption" style={[styles.score, winner && { fontWeight: '700' }, loser && { color: theme.textSecondary }]}>
              {score}
            </ThemedText>
          )}
        </>
      ) : (
        <ThemedText variant="caption" muted style={{ fontStyle: 'italic' }}>
          {placeholder}
        </ThemedText>
      )}
    </View>
  );
}

export function BracketMatchNode({
  match,
  x,
  y,
  highlighted,
  myEntryIds,
  label,
  onPress,
}: {
  match: TournamentMatch;
  x: number;
  y: number;
  highlighted: boolean;
  myEntryIds: Set<string>;
  label?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const decided = match.status === 'completed' || match.status === 'walkover';
  const bye = match.status === 'bye';
  const wo = match.status === 'walkover';
  const live = match.status === 'scheduled' && isToday(match.scheduled_at);
  const cancelled = match.status === 'cancelled';
  const time = formatMatchTime(match.scheduled_at);
  const caption = cancelled
    ? 'Not needed'
    : wo
      ? 'W/O'
      : bye
        ? match.auto_bye ? 'BYE' : null
        : time
          ? [match.code, time, match.court].filter(Boolean).join(' · ')
          : match.code;

  const scoreA = wo || bye ? null : match.score_a;
  const scoreB = wo || bye ? null : match.score_b;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.node,
        {
          left: x,
          top: y,
          backgroundColor: theme.backgroundElement,
          opacity: cancelled ? 0.5 : 1,
          borderColor: highlighted ? theme.accent : theme.border,
          borderWidth: highlighted ? 2 : 1,
        },
        pressed && { opacity: 0.7 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label ?? match.round_name} match ${match.match_number}`}
    >
      {label && (
        <ThemedText variant="caption" muted style={styles.label}>{label}</ThemedText>
      )}
      <Row
        entry={match.entry_a}
        score={scoreA}
        winner={decided || bye ? match.winner_entry_id === match.entry_a?.id && !!match.entry_a : false}
        decided={decided}
        mine={!!match.entry_a && myEntryIds.has(match.entry_a.id)}
        bye={bye}
        placeholder={slotPlaceholder(match.entry_a_label, bye && !match.entry_a)}
      />
      <Row
        entry={match.entry_b}
        score={scoreB}
        winner={decided || bye ? match.winner_entry_id === match.entry_b?.id && !!match.entry_b : false}
        decided={decided}
        mine={!!match.entry_b && myEntryIds.has(match.entry_b.id)}
        bye={bye}
        placeholder={slotPlaceholder(match.entry_b_label, bye && !match.entry_b)}
      />
      {(caption || live) && (
        <View style={styles.captionRow}>
          {live && <View style={[styles.dot, { backgroundColor: theme.success }]} />}
          {caption && (
            <ThemedText variant="caption" muted style={styles.caption} numberOfLines={1}>{caption}</ThemedText>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    borderRadius: Radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
  },
  label: { position: 'absolute', top: -18, left: 0, fontSize: 11, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24 },
  seed: { fontSize: 11, width: 26 },
  name: { flex: 1, fontSize: 13 },
  score: { fontSize: 13, minWidth: 16, textAlign: 'right' },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 14 },
  caption: { fontSize: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
