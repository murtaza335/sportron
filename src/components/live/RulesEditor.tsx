import { Minus, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarButton } from '@/components/live/parts';
import { SheetScrollView } from '@/components/motion/Sheet';
import { toast } from '@/components/motion/Toast';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { SectionLabel } from '@/components/tournaments/form';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useFlag } from '@/contexts/RemoteConfigContext';
import { useTheme } from '@/hooks/use-theme';
import { describeRules, PRESETS, presetsForSport, resolveRules, type Family, type LiveRules } from '@/lib/live';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { setModuleLiveRules } from '@/services/tournamentsLive';
import type { TournamentModule } from '@/types';

// ─── Which settings each rule family exposes ─────────────────────────────────────────────────────────────────

type Opt<T> = { value: T; label: string };
type Field =
  | { kind: 'num'; key: string; label: string; min: number; max: number }
  | { kind: 'optnum'; key: string; label: string; min: number; max: number; off: string }
  | { kind: 'minutes'; key: string; label: string; min: number; max: number }
  | { kind: 'enum'; key: string; label: string; options: Opt<string | number>[] }
  | { kind: 'list'; key: string; label: string; options: Opt<number[]>[] }
  | { kind: 'multi'; key: string; label: string; options: Opt<string>[] };

const FIELDS: Record<Family, Field[]> = {
  sets: [
    { kind: 'num', key: 'pointsToWin', label: 'Points to win a game', min: 1, max: 99 },
    { kind: 'enum', key: 'winBy', label: 'Win by', options: [{ value: 1, label: '1' }, { value: 2, label: '2' }] },
    { kind: 'optnum', key: 'cap', label: 'Point cap', min: 2, max: 99, off: 'No cap' },
    { kind: 'optnum', key: 'deciderPoints', label: 'Deciding game to', min: 1, max: 99, off: 'Same' },
    {
      kind: 'enum',
      key: 'serve',
      label: 'Serving',
      options: [
        { value: 'rally_winner', label: 'Rally winner' },
        { value: 'alternate_2', label: 'Every 2' },
        { value: 'alternate_5', label: 'Every 5' },
        { value: 'side_out', label: 'Side-out' },
        { value: 'none', label: 'Not tracked' },
      ],
    },
    { kind: 'optnum', key: 'changeEndsAt', label: 'Remind change of ends at', min: 1, max: 99, off: 'Never' },
    { kind: 'optnum', key: 'intervalAt', label: 'Remind interval at', min: 1, max: 99, off: 'Never' },
  ],
  tennis: [
    { kind: 'num', key: 'gamesPerSet', label: 'Games per set', min: 2, max: 10 },
    { kind: 'enum', key: 'deuce', label: 'At deuce', options: [{ value: 'advantage', label: 'Advantage' }, { value: 'golden_point', label: 'Golden point' }] },
    { kind: 'num', key: 'tiebreakPoints', label: 'Tiebreak to', min: 5, max: 15 },
    {
      kind: 'enum',
      key: 'finalSet',
      label: 'Deciding set',
      options: [{ value: 'tiebreak', label: 'Tiebreak' }, { value: 'super_tiebreak', label: 'Super tiebreak' }, { value: 'advantage', label: 'No tiebreak' }],
    },
    { kind: 'num', key: 'superTiebreakPoints', label: 'Super tiebreak to', min: 7, max: 15 },
  ],
  timed: [
    { kind: 'num', key: 'periods', label: 'Periods', min: 1, max: 4 },
    { kind: 'minutes', key: 'periodSeconds', label: 'Minutes per period', min: 1, max: 60 },
    { kind: 'enum', key: 'clock', label: 'Clock', options: [{ value: 'down', label: 'Counts down' }, { value: 'up', label: 'Counts up' }, { value: 'none', label: 'No clock' }] },
    { kind: 'list', key: 'buttons', label: 'Score buttons', options: [{ value: [1], label: '+1' }, { value: [1, 2], label: '+1 +2' }, { value: [1, 2, 3], label: '+1 +2 +3' }] },
    { kind: 'optnum', key: 'target', label: 'First to', min: 1, max: 99, off: 'Off' },
    {
      kind: 'enum',
      key: 'overtime',
      label: 'If level',
      options: [
        { value: 'none', label: 'No overtime' },
        { value: 'extra_time', label: 'Extra time' },
        { value: 'repeat_until_winner', label: 'Overtime until a winner' },
        { value: 'golden_goal', label: 'Golden goal' },
      ],
    },
    { kind: 'num', key: 'otPeriods', label: 'Extra-time periods', min: 0, max: 4 },
    { kind: 'minutes', key: 'otSeconds', label: 'Minutes per extra period', min: 1, max: 30 },
    {
      kind: 'enum',
      key: 'shootout',
      label: 'Then',
      options: [{ value: 'none', label: 'Nothing' }, { value: 'penalties', label: 'Penalties' }, { value: 'seven_metre', label: '7 m throws' }, { value: 'shootout', label: 'Shoot-out' }],
    },
    {
      kind: 'multi',
      key: 'counters',
      label: 'Show counters',
      options: [{ value: 'team_fouls', label: 'Team fouls' }, { value: 'timeouts', label: 'Timeouts' }, { value: 'cards', label: 'Cards' }, { value: 'corners', label: 'Corners' }],
    },
  ],
  cricket: [
    { kind: 'num', key: 'overs', label: 'Overs per innings', min: 1, max: 50 },
    { kind: 'num', key: 'wickets', label: 'Wickets', min: 1, max: 10 },
    { kind: 'enum', key: 'ballsPerOver', label: 'Balls per over', options: [{ value: 6, label: '6' }, { value: 8, label: '8' }] },
    { kind: 'enum', key: 'wideRuns', label: 'Wide counts', options: [{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }] },
    { kind: 'enum', key: 'noBallRuns', label: 'No-ball counts', options: [{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }] },
  ],
  simple: [
    { kind: 'list', key: 'buttons', label: 'Score buttons', options: [{ value: [1], label: '+1' }, { value: [1, 2], label: '+1 +2' }, { value: [1, 5], label: '+1 +5' }, { value: [1, 2, 3], label: '+1 +2 +3' }] },
    { kind: 'optnum', key: 'target', label: 'First to', min: 1, max: 999, off: 'No target' },
    { kind: 'enum', key: 'clock', label: 'Clock', options: [{ value: 'none', label: 'No clock' }, { value: 'up', label: 'Counts up' }, { value: 'down', label: 'Counts down' }] },
    { kind: 'num', key: 'minutes', label: 'Match length (minutes)', min: 0, max: 180 },
  ],
};

// ─── Small controls ──────────────────────────────────────────────────────────────────────────────────────────

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? theme.accent : theme.border, backgroundColor: selected ? theme.accent : theme.backgroundElement }]}
    >
      <ThemedText style={{ color: selected ? '#fff' : theme.text, fontWeight: '700' }}>{label}</ThemedText>
    </Pressable>
  );
}

function NumControl({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const theme = useTheme();
  const btn = (d: number, icon: React.ReactNode, name: string) => (
    <Pressable
      onPress={() => onChange(Math.max(min, Math.min(max, value + d)))}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${label}`}
      style={[styles.stepBtn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
    >
      {icon}
    </Pressable>
  );
  return (
    <View style={styles.num}>
      {btn(-1, <Minus size={22} color={theme.text} />, 'Decrease')}
      <ThemedText style={{ minWidth: 44, textAlign: 'center', fontSize: 22, fontWeight: '900' }}>{value}</ThemedText>
      {btn(1, <Plus size={22} color={theme.text} />, 'Increase')}
    </View>
  );
}

const sameList = (a: unknown, b: number[]) => Array.isArray(a) && a.length === b.length && a.every((x, i) => x === b[i]);

function FieldRow({ f, rules, set }: { f: Field; rules: Record<string, unknown>; set: (key: string, v: unknown) => void }) {
  const v = rules[f.key];
  return (
    <View style={{ gap: 6 }}>
      <ThemedText variant="label" muted>
        {f.label}
      </ThemedText>
      {f.kind === 'num' && <NumControl value={Number(v ?? f.min)} min={f.min} max={f.max} label={f.label} onChange={(n) => set(f.key, n)} />}
      {f.kind === 'minutes' && (
        <NumControl value={Math.round(Number(v ?? 0) / 60)} min={f.min} max={f.max} label={f.label} onChange={(n) => set(f.key, n * 60)} />
      )}
      {f.kind === 'optnum' && (
        <View style={styles.wrap}>
          <Chip label={f.off} selected={v == null} onPress={() => set(f.key, null)} />
          <NumControl value={v == null ? f.min : Number(v)} min={f.min} max={f.max} label={f.label} onChange={(n) => set(f.key, n)} />
        </View>
      )}
      {f.kind === 'enum' && (
        <View style={styles.wrap}>
          {f.options.map((o) => (
            <Chip key={String(o.value)} label={o.label} selected={v === o.value} onPress={() => set(f.key, o.value)} />
          ))}
        </View>
      )}
      {f.kind === 'list' && (
        <View style={styles.wrap}>
          {f.options.map((o) => (
            <Chip key={o.label} label={o.label} selected={sameList(v, o.value)} onPress={() => set(f.key, o.value)} />
          ))}
        </View>
      )}
      {f.kind === 'multi' && (
        <View style={styles.wrap}>
          {f.options.map((o) => {
            const list = Array.isArray(v) ? (v as string[]) : [];
            const on = list.includes(o.value);
            return <Chip key={o.value} label={o.label} selected={on} onPress={() => set(f.key, on ? list.filter((x) => x !== o.value) : [...list, o.value])} />;
          })}
        </View>
      )}
    </View>
  );
}

// ─── Section for the module manage screen ────────────────────────────────────────────────────────────────────

/** "Live scoring rules": preset + the family's settings. Applies to matches started afterwards. */
export function ModuleRulesSection({ module, onSaved }: { module: TournamentModule; onSaved: () => void | Promise<void> }) {
  const theme = useTheme();
  const enabled = useFlag('live_scoring', false);
  const current = useMemo(
    () => resolveRules({ sport: module.sport, sportKey: module.sport_key, liveRules: module.live_rules ?? null }),
    [module.sport, module.sport_key, module.live_rules],
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LiveRules>(current);
  const [busy, setBusy] = useState(false);
  const { mine, rest } = useMemo(() => presetsForSport(module.sport, module.sport_key), [module.sport, module.sport_key]);
  const scoringGames = (module.scoring_mode ?? (['table_tennis', 'badminton', 'tennis', 'squash', 'pickleball'].includes(module.sport) ? 'games' : 'score')) === 'games';
  const allowed = (id: string) => !scoringGames || ['sets', 'tennis'].includes(PRESETS[id].family);

  if (!enabled) return null;

  const choosePreset = (id: string) => setDraft({ ...PRESETS[id] } as LiveRules);
  const setField = (key: string, v: unknown) => setDraft((d) => ({ ...d, [key]: v }) as LiveRules);

  const save = async (rules: LiveRules | null) => {
    setBusy(true);
    try {
      await setModuleLiveRules(module.id, rules);
      toast('Scoring rules saved', 'New live matches use them.');
      setOpen(false);
      await onSaved();
    } catch (e) {
      toast('Couldn’t save', friendlyTournamentError(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Live scoring rules</SectionLabel>
      <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <ThemedText style={{ fontWeight: '700' }}>{describeRules(current)}</ThemedText>
        <ThemedText variant="caption" muted>
          {module.live_rules ? 'Custom rules for this module.' : 'Standard rules for this sport.'} “Best of” comes from each round. Changes apply to matches started afterwards.
        </ThemedText>
        <BarButton
          label="Change rules"
          onPress={() => {
            setDraft(current);
            setOpen(true);
          }}
        />
      </View>

      <BottomSheet visible={open} onClose={() => setOpen(false)} height="92%">
        <SheetScrollView contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.xl }} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Scoring rules</ThemedText>
          <ThemedText muted>{describeRules(draft)}</ThemedText>

          <View style={{ gap: 6 }}>
            <ThemedText variant="label" muted>
              Format
            </ThemedText>
            <View style={styles.wrap}>
              {mine.filter((p) => allowed(p.id)).map((p) => (
                <Chip key={p.id} label={p.label} selected={draft.preset === p.id} onPress={() => choosePreset(p.id)} />
              ))}
            </View>
            {rest.filter((p) => allowed(p.id)).length > 0 && (
              <>
                <ThemedText variant="caption" muted>
                  Other formats
                </ThemedText>
                <View style={styles.wrap}>
                  {rest.filter((p) => allowed(p.id)).map((p) => (
                    <Chip key={p.id} label={p.label} selected={draft.preset === p.id} onPress={() => choosePreset(p.id)} />
                  ))}
                </View>
              </>
            )}
          </View>

          {FIELDS[draft.family].map((f) => (
            <FieldRow key={f.key} f={f} rules={draft as unknown as Record<string, unknown>} set={setField} />
          ))}

          <BarButton label={busy ? 'Saving…' : 'Save rules'} tone="primary" disabled={busy} style={{ minHeight: 60 }} onPress={() => void save(draft)} />
          {module.live_rules ? <BarButton label="Use the sport’s standard rules" disabled={busy} onPress={() => void save(null)} /> : null}
        </SheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  num: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  stepBtn: { width: 44, height: 44, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
