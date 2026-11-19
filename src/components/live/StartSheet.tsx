import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BarButton } from '@/components/live/parts';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { SheetScrollView } from '@/components/motion/Sheet';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { LiveSide } from '@/constants/liveColors';
import { useTheme } from '@/hooks/use-theme';
import { describeRules, presetsForSport, type LiveRules, type Side } from '@/lib/live';
import type { TournamentMatch, TournamentModule } from '@/types';

export interface StartChoice {
  rules: LiveRules;
  court: string | null;
  firstServer: Side;
  firstBat: Side;
}

function Chip({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const theme = useTheme();
  const tone = color ?? theme.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? tone : theme.border, backgroundColor: selected ? tone : theme.backgroundElement }]}
    >
      <ThemedText style={{ color: selected ? '#fff' : theme.text, fontWeight: '700' }}>{label}</ThemedText>
    </Pressable>
  );
}

/** Everything is pre-filled from the sport preset; the referee normally just taps Start. */
export function StartSheet({
  visible,
  match,
  module,
  courts,
  resolve,
  busy,
  error,
  onStart,
  onClose,
}: {
  visible: boolean;
  match: TournamentMatch;
  module: TournamentModule;
  /** Courts already used in this module (quick chips). */
  courts: string[];
  /** Resolves rules for a preset id / best-of (the module's saved rules + the match's best-of + draw flag). */
  resolve: (preset: string | null, bestOf: number | null) => LiveRules;
  busy: boolean;
  error: string | null;
  onStart: (c: StartChoice) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [rules, setRules] = useState<LiveRules>(() => resolve(null, null));
  const [court, setCourt] = useState<string | null>(match.court);
  const [otherCourt, setOtherCourt] = useState('');
  const [other, setOther] = useState(false);
  const [changing, setChanging] = useState(false);
  const [firstServer, setFirstServer] = useState<Side>('a');
  const [firstBat, setFirstBat] = useState<Side>('a');
  const { mine, rest } = useMemo(() => presetsForSport(module.sport, module.sport_key), [module.sport, module.sport_key]);
  const a = match.entry_a?.name ?? 'Side A';
  const b = match.entry_b?.name ?? 'Side B';
  const hasBestOf = rules.family === 'sets' || rules.family === 'tennis';
  const choices = Array.from(new Set([...(match.court ? [match.court] : []), ...courts]));

  const pickPreset = (id: string) => {
    setRules(resolve(id, hasBestOf ? (rules as { bestOf: number }).bestOf : null));
    setChanging(false);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="92%">
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText variant="heading">Start live scoring</ThemedText>
        <ThemedText muted>
          {a} vs {b}
        </ThemedText>

        <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          <ThemedText variant="label" muted>
            Rules
          </ThemedText>
          <ThemedText style={{ fontWeight: '600' }}>{describeRules(rules)}</ThemedText>
          <Pressable onPress={() => setChanging((v) => !v)} accessibilityRole="button" hitSlop={8}>
            <ThemedText style={{ color: theme.accent, fontWeight: '700' }}>{changing ? 'Hide options' : 'Change'}</ThemedText>
          </Pressable>
          {changing && (
            <View style={{ gap: Spacing.sm }}>
              {hasBestOf && (
                <View style={styles.wrapRow}>
                  {(rules.family === 'tennis' ? [1, 3, 5] : [1, 3, 5, 7]).map((n) => (
                    <Chip key={n} label={`Best of ${n}`} selected={(rules as { bestOf: number }).bestOf === n} onPress={() => setRules(resolve(rules.preset, n))} />
                  ))}
                </View>
              )}
              <View style={styles.wrapRow}>
                {[...mine, ...rest.slice(0, 0)].map((p) => (
                  <Chip key={p.id} label={p.label} selected={rules.preset === p.id} onPress={() => pickPreset(p.id)} />
                ))}
              </View>
              {rest.length > 0 && (
                <>
                  <ThemedText variant="caption" muted>
                    Other formats
                  </ThemedText>
                  <View style={styles.wrapRow}>
                    {rest.map((p) => (
                      <Chip key={p.id} label={p.label} selected={rules.preset === p.id} onPress={() => pickPreset(p.id)} />
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
        </View>

        {(rules.family === 'sets' || rules.family === 'tennis') && (
          <View style={{ gap: Spacing.xs }}>
            <ThemedText variant="label" muted>
              Who serves first
            </ThemedText>
            <View style={styles.wrapRow}>
              <Chip label={a} selected={firstServer === 'a'} color={LiveSide.a.fg} onPress={() => setFirstServer('a')} />
              <Chip label={b} selected={firstServer === 'b'} color={LiveSide.b.fg} onPress={() => setFirstServer('b')} />
            </View>
          </View>
        )}
        {rules.family === 'cricket' && (
          <View style={{ gap: Spacing.xs }}>
            <ThemedText variant="label" muted>
              Who bats first
            </ThemedText>
            <View style={styles.wrapRow}>
              <Chip label={a} selected={firstBat === 'a'} color={LiveSide.a.fg} onPress={() => setFirstBat('a')} />
              <Chip label={b} selected={firstBat === 'b'} color={LiveSide.b.fg} onPress={() => setFirstBat('b')} />
            </View>
          </View>
        )}

        <View style={{ gap: Spacing.xs }}>
          <ThemedText variant="label" muted>
            Court (optional)
          </ThemedText>
          <View style={styles.wrapRow}>
            {choices.map((c) => (
              <Chip key={c} label={c} selected={!other && court === c} onPress={() => { setOther(false); setCourt(court === c ? null : c); }} />
            ))}
            <Chip label="Other…" selected={other} onPress={() => { setOther(true); setCourt(null); }} />
          </View>
          {other && (
            <TextInput
              value={otherCourt}
              onChangeText={setOtherCourt}
              placeholder="e.g. Court 4"
              placeholderTextColor={theme.placeholder}
              maxLength={40}
              style={[styles.input, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]}
            />
          )}
          <ThemedText variant="caption" muted>
            Shown on the projector screen. You can skip it.
          </ThemedText>
        </View>

        {error ? (
          <ThemedText style={{ color: theme.error, fontWeight: '600' }}>{error}</ThemedText>
        ) : null}

        <BarButton
          label={busy ? 'Starting…' : 'Start'}
          tone="primary"
          disabled={busy}
          style={{ minHeight: 64 }}
          onPress={() => onStart({ rules, court: other ? otherCourt.trim() || null : court, firstServer, firstBat })}
        />
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingBottom: Spacing.lg },
  box: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
});
