import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Banner, BarButton, ValueButton } from '@/components/live/parts';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import type { LiveScorer } from '@/hooks/useLiveScorer';
import { useTheme } from '@/hooks/use-theme';
import { useTicker } from '@/hooks/useTicker';
import { haptics } from '@/lib/haptics';
import {
  formatClock,
  inBonus,
  periodLimitMs,
  periodName,
  shootoutNext,
  shootoutScore,
  timedElapsed,
  timeoutLimit,
  type CounterSet,
  type Names,
  type Side,
  type SimpleRules,
  type TimedRules,
} from '@/lib/live';

// ─── Clock card ──────────────────────────────────────────────────────────────

export function ClockCard({ scorer, rules, disabled }: { scorer: LiveScorer; rules: TimedRules | SimpleRules; disabled: boolean }) {
  const theme = useTheme();
  const { snap, act } = scorer;
  const running = (snap.family === 'timed' || snap.family === 'simple') && snap.clock.running;
  const now = useTicker(running);
  // A countdown stops itself at 0:00 (the reducer keeps the elapsed time at the period length).
  const expired =
    running && snap.family === 'timed' && rules.family === 'timed' && rules.clock === 'down' &&
    periodLimitMs(rules, snap.period) != null && timedElapsed(snap, now) >= periodLimitMs(rules, snap.period)!;
  useEffect(() => {
    if (!expired || disabled) return;
    haptics.warning();
    act({ t: 'clockStop', at: Date.now() });
  }, [expired, disabled, act]);
  if ((snap.family !== 'timed' && snap.family !== 'simple') || rules.clock === 'none') return null;

  const timed = snap.family === 'timed' && rules.family === 'timed';
  const limit = timed ? periodLimitMs(rules as TimedRules, snap.period) : (rules as SimpleRules).minutes > 0 ? (rules as SimpleRules).minutes * 60000 : null;
  const elapsed = timed ? timedElapsed(snap, now) : snap.clock.running ? snap.clock.elapsedMs + Math.max(0, now - snap.clock.ref) : snap.clock.elapsedMs;
  const dir = rules.clock === 'down' ? 'down' : 'up';
  const timeUp = limit != null && (dir === 'down' ? elapsed >= limit : elapsed >= limit);
  const text = formatClock(elapsed, dir, limit);
  const untimed = timed && snap.family === 'timed' && snap.period > (rules as TimedRules).periods && !!(rules as TimedRules).otTarget;
  const added = timed && snap.family === 'timed' && snap.addedMinutes > 0 ? ` +${snap.addedMinutes}'` : '';

  return (
    <View style={[styles.clock, { backgroundColor: theme.backgroundElement, borderColor: timeUp && running ? theme.error : theme.border }]}>
      <View style={styles.clockTop}>
        {timed && snap.family === 'timed' ? (
          <ThemedText variant="label" muted>
            {periodName(rules as TimedRules, snap.period)}
          </ThemedText>
        ) : (
          <View />
        )}
        <ThemedText style={[styles.clockText, timeUp && { color: theme.error }]} accessibilityLabel={`Clock ${text}`}>
          {text}
          {added}
        </ThemedText>
        <View style={{ minWidth: 40 }} />
      </View>
      <View style={styles.clockButtons}>
        <BarButton
          label={running ? 'Stop clock' : 'Start clock'}
          tone={running ? 'default' : 'primary'}
          disabled={disabled || snap.state === 'decided'}
          style={styles.flex}
          onPress={() => {
            haptics.medium();
            act(running ? { t: 'clockStop', at: Date.now() } : { t: 'clockStart', at: Date.now() });
          }}
        />
        {timed && !untimed && (
          <BarButton
            label="End period"
            tone={timeUp ? 'primary' : 'default'}
            disabled={disabled || snap.state !== 'live'}
            style={styles.flex}
            onPress={() => {
              haptics.medium();
              act({ t: 'endPeriod', at: Date.now() });
            }}
          />
        )}
      </View>
      {timed && rules.clock === 'up' && snap.state === 'live' && (
        <View style={styles.clockButtons}>
          <BarButton label="+1 min added" onPress={() => act({ t: 'addedTime', minutes: (snap.family === 'timed' ? snap.addedMinutes : 0) + 1 })} style={styles.flex} />
          {snap.family === 'timed' && snap.addedMinutes > 0 && (
            <BarButton label="Clear added time" onPress={() => act({ t: 'addedTime', minutes: 0 })} style={styles.flex} />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Counters (team fouls, timeouts, cards) ──────────────────────────────────

export function CounterChip({
  label,
  value,
  limit,
  warn,
  onChange,
}: {
  label: string;
  value: number;
  limit?: number | null;
  warn?: boolean;
  onChange: (delta: number) => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onChange(1);
      }}
      onLongPress={() => {
        haptics.medium();
        onChange(-1);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value}. Tap to add, hold to remove`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: warn ? 'rgba(245,158,11,0.2)' : theme.backgroundElement, borderColor: warn ? theme.warning : theme.border, opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <ThemedText style={{ fontWeight: '700' }}>
        {label} {value}
        {limit != null ? `/${limit}` : ''}
      </ThemedText>
    </Pressable>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────

export function TimedPanel({ scorer, rules, names, swapped, disabled }: { scorer: LiveScorer; rules: TimedRules; names: Names; swapped: boolean; disabled: boolean }) {
  const theme = useTheme();
  const { snap, act, summary } = scorer;
  if (snap.family !== 'timed') return null;
  const order: Side[] = swapped ? ['b', 'a'] : ['a', 'b'];
  const live = snap.state === 'live';
  const shootout = snap.phase === 'shootout' && snap.shootout;
  const kicker = shootout ? shootoutNext(snap.shootout!) : null;
  const so = shootout ? shootoutScore(snap.shootout!) : null;

  const counterChips = (side: Side) => {
    const c = snap.counters[side];
    const chips: React.ReactNode[] = [];
    const set = (key: keyof CounterSet, delta: number) => act({ t: 'counter', side, key, delta });
    if (rules.counters.includes('team_fouls'))
      chips.push(<CounterChip key="f" label="Fouls" value={c.fouls} warn={inBonus(snap, rules, side === 'a' ? 'b' : 'a')} onChange={(d) => set('fouls', d)} />);
    if (rules.counters.includes('timeouts'))
      chips.push(<CounterChip key="t" label="Timeouts" value={c.timeouts} limit={timeoutLimit(rules, snap.period)} onChange={(d) => set('timeouts', d)} />);
    if (rules.counters.includes('cards')) {
      chips.push(<CounterChip key="y" label="Yellow" value={c.yellow} onChange={(d) => set('yellow', d)} />);
      chips.push(<CounterChip key="r" label="Red" value={c.red} onChange={(d) => set('red', d)} />);
    }
    if (rules.counters.includes('corners')) chips.push(<CounterChip key="c" label="Corners" value={c.corners} onChange={(d) => set('corners', d)} />);
    return chips;
  };

  return (
    <View style={styles.flex}>
      {!shootout && <ClockCard scorer={scorer} rules={rules} disabled={disabled} />}

      {snap.state === 'break' && (
        <View style={styles.pad}>
          <Banner text={`${summary.state_label} — ${periodName(rules, snap.period)} is over`} />
          <BarButton label={`Start ${periodName(rules, snap.period + 1)}`} tone="primary" style={{ marginTop: Spacing.sm }} disabled={disabled} onPress={() => act({ t: 'nextPeriod' })} />
        </View>
      )}

      {shootout && kicker && (
        <View style={[styles.shootout, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <ThemedText variant="label" muted>
            {summary.state_label}
          </ThemedText>
          {(['a', 'b'] as Side[]).map((s) => (
            <View key={s} style={styles.kickRow}>
              <View style={[styles.kickDot, { backgroundColor: SideColors[s].fg }]} />
              <ThemedText numberOfLines={1} style={{ width: 110, fontWeight: '700' }}>
                {names[s]}
              </ThemedText>
              <View style={styles.kicks}>
                {snap.shootout!.kicks[s].map((k, i) => (
                  <ThemedText key={i} style={{ fontSize: 22, color: k ? theme.success : theme.error }}>
                    {k ? '✓' : '✗'}
                  </ThemedText>
                ))}
              </View>
              <ThemedText style={{ fontWeight: '800', fontSize: 22 }}>{s === 'a' ? so!.a : so!.b}</ThemedText>
            </View>
          ))}
          {live && (
            <>
              <ThemedText style={{ fontWeight: '700', textAlign: 'center', marginTop: Spacing.sm }}>{names[kicker]} to take the next one</ThemedText>
              <View style={styles.clockButtons}>
                <ValueButton label="✓ Scored" color={theme.success} size={64} onPress={() => act({ t: 'kick', scored: true })} style={styles.flex} />
                <ValueButton label="✗ Missed" color={theme.error} size={64} onPress={() => act({ t: 'kick', scored: false })} style={styles.flex} />
              </View>
            </>
          )}
        </View>
      )}

      {!shootout && (
        <View style={styles.cols}>
          {order.map((side) => (
            <View key={side} style={[styles.col, { backgroundColor: SideColors[side].soft, borderColor: SideColors[side].fg }]}>
              <ThemedText numberOfLines={2} style={{ fontWeight: '800', fontSize: 18, textAlign: 'center', color: SideColors[side].fg }}>
                {names[side]}
              </ThemedText>
              <ThemedText allowFontScaling={false} style={styles.score} accessibilityLabel={`${names[side]} ${side === 'a' ? summary.a : summary.b}`}>
                {side === 'a' ? summary.a : summary.b}
              </ThemedText>
              <View style={styles.valueRow}>
                {rules.buttons.map((v) => (
                  <ValueButton
                    key={v}
                    label={`+${v}`}
                    color={SideColors[side].fg}
                    size={68}
                    disabled={disabled || snap.state === 'decided'}
                    accessibilityLabel={`${v} ${v === 1 ? rules.label.toLowerCase() : rules.label.toLowerCase() + 's'} to ${names[side]}`}
                    onPress={() => act({ t: 'score', side, value: v, at: Date.now() })}
                  />
                ))}
                <ValueButton label="−1" size={68} small disabled={disabled} accessibilityLabel={`Remove one from ${names[side]}`} onPress={() => act({ t: 'score', side, value: -1 })} />
              </View>
              <View style={styles.chips}>{counterChips(side)}</View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.sm },
  clock: { margin: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md, borderWidth: 2, gap: Spacing.sm },
  clockTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clockText: { fontSize: 48, lineHeight: 54, fontWeight: '900', fontVariant: ['tabular-nums'] },
  clockButtons: { flexDirection: 'row', gap: Spacing.sm },
  cols: { flex: 1, flexDirection: 'row', gap: Spacing.sm, padding: Spacing.sm },
  col: { flex: 1, borderWidth: 2, borderRadius: Radius.md, padding: Spacing.sm, alignItems: 'center', gap: Spacing.sm },
  score: { fontSize: 72, lineHeight: 80, fontWeight: '900', fontVariant: ['tabular-nums'] },
  valueRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  shootout: { margin: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1, gap: Spacing.sm },
  kickRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  kickDot: { width: 12, height: 12, borderRadius: 6 },
  kicks: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
