import { Check } from 'lucide-react-native';
import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LivePill } from '@/components/live/LivePill';
import { ThemedText } from '@/components/ui/Text';
import { Radius } from '@/constants/theme';
import { NODE_H, NODE_W } from '@/lib/bracketLayout';
import { useIsLive } from '@/lib/liveStatusStore';
import { formatMatchTime, isTodayLocal, slotPlaceholder } from '@/lib/tournamentFormat';
import type { BracketEntryRef, TournamentMatch } from '@/types';

/**
 * Bracket nodes are deliberately plain: a bracket can have 60+ of them mounted at once, so each
 * one is memoized, takes only primitive colour props (no per-node theme context subscription) and
 * has no per-node animation hooks (those made the first render and tab switches janky).
 */
export type BracketColors = {
  card: string;
  border: string;
  accent: string;
  success: string;
  muted: string;
};

const Row = memo(function Row({
  entry,
  score,
  winner,
  decided,
  mine,
  bye,
  placeholder,
  colors,
}: {
  entry: BracketEntryRef | null;
  score: number | null;
  winner: boolean;
  decided: boolean;
  mine: boolean;
  bye: boolean;
  placeholder: string;
  colors: BracketColors;
}) {
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
              loser && { color: colors.muted },
              mine && { color: colors.accent },
            ]}
          >
            {entry.name}
          </ThemedText>
          {winner && !bye && <Check size={12} color={colors.success} strokeWidth={3} />}
          {score != null && (
            <ThemedText variant="caption" style={[styles.score, winner && { fontWeight: '700' }, loser && { color: colors.muted }]}>
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
});

export const BracketMatchNode = memo(function BracketMatchNode({
  match,
  x,
  y,
  highlighted,
  mineA,
  mineB,
  label,
  onSelect,
  colors,
}: {
  match: TournamentMatch;
  x: number;
  y: number;
  highlighted: boolean;
  /** Entry A / B belongs to the viewer. */
  mineA: boolean;
  mineB: boolean;
  label?: string;
  /** One stable callback shared by all nodes; receives the match id. */
  onSelect: (matchId: string) => void;
  colors: BracketColors;
}) {
  const decided = match.status === 'completed' || match.status === 'walkover';
  const bye = match.status === 'bye';
  const wo = match.status === 'walkover';
  const live = match.status === 'scheduled' && isTodayLocal(match.scheduled_at);
  const cancelled = match.status === 'cancelled';
  const liveNow = useIsLive(match.id);
  const time = useMemo(() => formatMatchTime(match.scheduled_at), [match.scheduled_at]);
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
  const onPress = useCallback(() => onSelect(match.id), [onSelect, match.id]);

  return (
    <View style={[styles.node, { left: x, top: y, opacity: cancelled ? 0.5 : 1 }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.inner,
          {
            backgroundColor: colors.card,
            borderColor: highlighted ? colors.accent : colors.border,
            borderWidth: highlighted ? 2 : 1,
            opacity: pressed ? 0.7 : 1,
          },
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
          mine={mineA}
          bye={bye}
          placeholder={slotPlaceholder(match.entry_a_label, bye && !match.entry_a)}
          colors={colors}
        />
        <Row
          entry={match.entry_b}
          score={scoreB}
          winner={decided || bye ? match.winner_entry_id === match.entry_b?.id && !!match.entry_b : false}
          decided={decided}
          mine={mineB}
          bye={bye}
          placeholder={slotPlaceholder(match.entry_b_label, bye && !match.entry_b)}
          colors={colors}
        />
        {(caption || live || liveNow) && (
          <View style={styles.captionRow}>
            {liveNow ? <LivePill compact /> : live && <View style={[styles.dot, { backgroundColor: colors.success }]} />}
            {caption && (
              <ThemedText variant="caption" muted style={styles.caption} numberOfLines={1}>{caption}</ThemedText>
            )}
          </View>
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
  },
  inner: {
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
