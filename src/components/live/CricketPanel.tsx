import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Banner, BarButton, ValueButton } from '@/components/live/parts';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import type { LiveScorer } from '@/hooks/useLiveScorer';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import type { CricketBall, CricketRules, Names } from '@/lib/live';

type Pending = null | { kind: CricketBall | 'wicket' | 'penalty'; title: string };

const KEYS: { label: string; run?: number; kind?: Pending }[] = [
  { label: '0', run: 0 },
  { label: '1', run: 1 },
  { label: '2', run: 2 },
  { label: '3', run: 3 },
  { label: '4', run: 4 },
  { label: '6', run: 6 },
  { label: 'W', kind: { kind: 'wicket', title: 'Wicket — runs completed before it' } },
  { label: 'Wd', kind: { kind: 'wide', title: 'Wide — extra runs' } },
  { label: 'Nb', kind: { kind: 'noball', title: 'No-ball — runs off the bat' } },
  { label: 'B', kind: { kind: 'bye', title: 'Byes — runs' } },
  { label: 'Lb', kind: { kind: 'legbye', title: 'Leg byes — runs' } },
  { label: '+5', kind: { kind: 'penalty', title: 'Penalty runs' } },
];

/** Ball-by-ball cricket: score the batting side, tap the outcome of every ball. */
export function CricketPanel({ scorer, rules, names, disabled }: { scorer: LiveScorer; rules: CricketRules; names: Names; disabled: boolean }) {
  const theme = useTheme();
  const { snap, summary, act } = scorer;
  const [pending, setPending] = useState<Pending>(null);
  if (snap.family !== 'cricket') return null;
  const inn = snap.innings[snap.current];
  const batting = inn.batting;
  const color = SideColors[batting].fg;
  const live = snap.state === 'live';

  const apply = (p: NonNullable<Pending>, runs: number) => {
    if (p.kind === 'wicket') act({ t: 'wicket', runs });
    else if (p.kind === 'penalty') act({ t: 'penalty', runs: runs || 5 });
    else act({ t: 'ball', kind: p.kind, runs });
    setPending(null);
  };

  return (
    <View style={styles.flex}>
      <View style={[styles.head, { backgroundColor: SideColors[batting].soft, borderColor: color }]}>
        <ThemedText variant="label" style={{ color }}>
          {names[batting]} batting
        </ThemedText>
        <ThemedText allowFontScaling={false} style={styles.score} accessibilityLabel={`Score ${summary[batting]}`}>
          {summary[batting]}
        </ThemedText>
        <ThemedText style={{ fontWeight: '700' }}>{summary.line}</ThemedText>
        {inn.thisOver.length > 0 && (
          <View style={styles.over}>
            {inn.thisOver.map((t, i) => (
              <View key={i} style={[styles.ball, { borderColor: t.includes('W') && !t.includes('Wd') ? theme.error : theme.border, backgroundColor: theme.backgroundElement }]}>
                <ThemedText style={{ fontWeight: '800' }}>{t}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>

      {snap.state === 'break' && (
        <View style={styles.pad}>
          <Banner text={`Innings break · ${names[batting]} ${summary[batting]} · target ${snap.target ?? '—'}`} />
          <BarButton label="Start 2nd innings" tone="primary" style={{ marginTop: Spacing.sm }} disabled={disabled} onPress={() => act({ t: 'nextInnings' })} />
        </View>
      )}

      {live && !pending && (
        <View style={styles.pad}>
          <View style={styles.grid}>
            {KEYS.map((k) => (
              <ValueButton
                key={k.label}
                label={k.label}
                size={64}
                color={k.run != null ? color : k.label === 'W' ? theme.error : undefined}
                disabled={disabled}
                style={styles.key}
                accessibilityLabel={k.run != null ? `${k.run} runs` : k.kind!.title}
                onPress={() => (k.run != null ? act({ t: 'ball', kind: 'normal', runs: k.run }) : setPending(k.kind!))}
              />
            ))}
          </View>
          <BarButton label="End innings" onPress={() => act({ t: 'endInnings' })} style={{ marginTop: Spacing.sm }} disabled={disabled} />
        </View>
      )}

      {live && pending && (
        <View style={styles.pad}>
          <ThemedText style={{ fontWeight: '800', marginBottom: Spacing.sm, textAlign: 'center' }}>{pending.title}</ThemedText>
          <View style={styles.grid}>
            {(pending.kind === 'penalty' ? [5] : [0, 1, 2, 3, 4, 5, 6]).map((r) => (
              <ValueButton key={r} label={String(r)} size={64} color={color} style={styles.key} onPress={() => { haptics.light(); apply(pending, r); }} />
            ))}
          </View>
          <BarButton label="Cancel" onPress={() => setPending(null)} style={{ marginTop: Spacing.sm }} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.sm },
  head: { margin: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 2, alignItems: 'center', gap: 4 },
  score: { fontSize: 64, lineHeight: 72, fontWeight: '900', fontVariant: ['tabular-nums'] },
  over: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  ball: { minWidth: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  key: { flexBasis: '22%', flexGrow: 1 },
});
