import { StyleSheet, View } from 'react-native';

import { ClockCard } from '@/components/live/TimedPanel';
import { ScoreHalf, ValueButton } from '@/components/live/parts';
import { Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import type { LiveScorer } from '@/hooks/useLiveScorer';
import type { Names, Side, SimpleRules } from '@/lib/live';

/** Any sport without its own rules (and anything "Other"): two big counters, optional extra values and clock. */
export function SimplePanel({ scorer, rules, names, swapped, disabled }: { scorer: LiveScorer; rules: SimpleRules; names: Names; swapped: boolean; disabled: boolean }) {
  const { snap, summary, act } = scorer;
  if (snap.family !== 'simple') return null;
  const order: Side[] = swapped ? ['b', 'a'] : ['a', 'b'];
  const main = rules.buttons[0] ?? 1;
  const extra = rules.buttons.slice(1);
  const done = snap.state === 'decided';

  return (
    <View style={styles.flex}>
      <ClockCard scorer={scorer} rules={rules} disabled={disabled} />
      <View style={styles.row}>
        {order.map((side) => (
          <ScoreHalf
            key={side}
            side={side}
            name={names[side]}
            big={side === 'a' ? summary.a : summary.b}
            subs={[]}
            serving={false}
            disabled={disabled || done}
            onAdd={() => act({ t: 'score', side, value: main, at: Date.now() })}
            onSub={() => act({ t: 'score', side, value: -main })}
            accessibilityLabel={`${main} to ${names[side]}. Score ${side === 'a' ? summary.a : summary.b} to ${side === 'a' ? summary.b : summary.a}`}
          />
        ))}
      </View>
      {extra.length > 0 && (
        <View style={styles.extra}>
          {order.map((side) => (
            <View key={side} style={styles.extraCol}>
              {extra.map((v) => (
                <ValueButton key={v} label={`+${v}`} color={SideColors[side].fg} size={56} disabled={disabled || done} onPress={() => act({ t: 'score', side, value: v, at: Date.now() })} />
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flex: 1, flexDirection: 'row' },
  extra: { flexDirection: 'row', padding: Spacing.sm, gap: Spacing.sm },
  extraCol: { flex: 1, flexDirection: 'row', gap: Spacing.sm, justifyContent: 'center' },
});
