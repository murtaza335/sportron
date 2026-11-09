import { Check } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { Duration, RM } from '@/lib/motion';

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
          {winner && !bye && (
            <Animated.View entering={ZoomIn.springify().damping(12).reduceMotion(RM)}>
              <Check size={12} color={theme.success} strokeWidth={3} />
            </Animated.View>
          )}
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
  enterDelay = 0,
}: {
  match: TournamentMatch;
  x: number;
  y: number;
  highlighted: boolean;
  myEntryIds: Set<string>;
  label?: string;
  onPress: () => void;
  /** Stagger for the first render (round index × 80ms). */
  enterDelay?: number;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const flash = useSharedValue(0);
  const prevWinner = useRef(match.winner_entry_id);
  // A realtime result arriving flashes the accent border once (never on the initial render).
  useEffect(() => {
    if (prevWinner.current !== match.winner_entry_id && match.winner_entry_id && !reduced) {
      flash.set(withSequence(withTiming(1, { duration: 150 }), withTiming(0, { duration: 650 })));
    }
    prevWinner.current = match.winner_entry_id;
  }, [match.winner_entry_id, reduced, flash]);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
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
    <Animated.View
      entering={FadeIn.delay(enterDelay).duration(Duration.base).reduceMotion(RM)}
      style={[styles.node, { left: x, top: y, opacity: cancelled ? 0.5 : 1 }]}>
    <PressableScale
      onPress={onPress}
      scaleTo={0.97}
      style={[
        styles.inner,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: highlighted ? theme.accent : theme.border,
          borderWidth: highlighted ? 2 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${label ?? match.round_name} match ${match.match_number}`}
    >
      <Animated.View pointerEvents="none" style={[styles.flash, { borderColor: theme.accent }, flashStyle]} />
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
    </PressableScale>
    </Animated.View>
  );
}

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
  flash: {
    ...StyleSheet.absoluteFill as object,
    borderWidth: 3,
    borderRadius: Radius.md,
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
