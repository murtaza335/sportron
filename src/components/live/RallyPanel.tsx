import { StyleSheet, View } from 'react-native';

import { Banner, ScoreHalf } from '@/components/live/parts';
import type { LiveScorer } from '@/hooks/useLiveScorer';
import { setsNotices, type Names, type SetsRules, type Side, type TennisRules } from '@/lib/live';
import { Spacing } from '@/constants/theme';

/** Rally sports (table tennis, badminton, squash, pickleball, volleyball) and tennis: two big halves, tap = point. */
export function RallyPanel({
  scorer,
  rules,
  names,
  swapped,
  disabled,
}: {
  scorer: LiveScorer;
  rules: SetsRules | TennisRules;
  names: Names;
  swapped: boolean;
  disabled: boolean;
}) {
  const { snap, summary, act } = scorer;
  if (snap.family !== 'sets' && snap.family !== 'tennis') return null;
  const order: Side[] = swapped ? ['b', 'a'] : ['a', 'b'];
  const isTennis = snap.family === 'tennis';
  const sideOut = rules.family === 'sets' && rules.serve === 'side_out';
  const live = snap.state === 'live';

  const half = (side: Side) => {
    const serving = summary.server === side;
    return (
      <ScoreHalf
        key={side}
        side={side}
        name={names[side]}
        big={side === 'a' ? summary.a : summary.b}
        midLabel={isTennis ? (live ? 'Games' : 'Sets') : 'Sets'}
        mid={side === 'a' ? summary.a_mid : summary.b_mid}
        subs={side === 'a' ? summary.a_sub : summary.b_sub}
        serving={serving}
        hint={sideOut && live ? (serving ? 'Serving · tap = point' : 'Tap = side out') : undefined}
        disabled={disabled || snap.state === 'decided'}
        onAdd={() => act({ t: 'point', side })}
        onSub={isTennis ? undefined : () => act({ t: 'unpoint', side })}
        accessibilityLabel={`Point to ${names[side]}. Score ${side === 'a' ? summary.a : summary.b} to ${side === 'a' ? summary.b : summary.a}`}
      />
    );
  };

  const banners: { text: string; tone?: 'info' | 'warn'; action?: boolean }[] = [];
  if (snap.state === 'break') {
    const last = snap.family === 'sets' ? snap.games[snap.games.length - 1] : snap.sets[snap.sets.length - 1];
    if (last) {
      const w: Side = last.a > last.b ? 'a' : 'b';
      banners.push({
        text: `${isTennis ? 'Set' : 'Game'} to ${names[w]} ${last.a}–${last.b}. Tap a side to start the next ${isTennis ? 'set' : 'game'}.`,
        action: true,
      });
    }
  }
  if (snap.family === 'sets' && rules.family === 'sets') {
    const n = setsNotices(snap, rules);
    if (n.changeEnds) banners.push({ text: 'Change ends', tone: 'warn' });
    else if (n.interval) banners.push({ text: 'Interval — players may take a short break', tone: 'warn' });
    if (rules.serve === 'side_out' && live && summary.line) banners.push({ text: summary.line });
  }

  return (
    <View style={styles.flex}>
      <View style={styles.row}>{order.map(half)}</View>
      {banners.length > 0 && (
        <View style={styles.banners}>
          {banners.map((b, i) => (
            <Banner key={i} text={b.text} tone={b.tone} actionLabel={b.action && scorer.canUndo ? 'Undo' : undefined} onAction={scorer.undo} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  banners: { gap: Spacing.xs, padding: Spacing.sm },
});
