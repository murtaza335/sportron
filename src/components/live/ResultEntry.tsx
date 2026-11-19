import { Minus, Plus, Redo2, Undo2, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, BarButton } from '@/components/live/parts';
import { toast } from '@/components/motion/Toast';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import {
  composeNote,
  emptyForm,
  evaluateForm,
  formFromMatch,
  maxRows,
  newFormHistory,
  pushForm,
  redoForm,
  replaceForm,
  saveBlocker,
  startRows,
  undoForm,
  type LiveRules,
  type Names,
  type ResultForm,
  type Side,
} from '@/lib/live';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { matchTitle } from '@/lib/tournamentFormat';
import { recordResult, recordWalkover } from '@/services/tournaments';
import type { TournamentMatch } from '@/types';

// ─── Big stepper: [ − ] 21 [ + ] — tap the number to type, hold + / − to repeat ─────────────────────────────

function Stepper({ value, onChange, label, side, max = 999 }: { value: number; onChange: (n: number) => void; label: string; side: Side; max?: number }) {
  const theme = useTheme();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value; // eslint-disable-line react-hooks/refs -- latest value for the hold-to-repeat interval

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const step = (d: number) => {
    const n = Math.max(0, Math.min(max, valueRef.current + d));
    valueRef.current = n;
    onChange(n);
  };
  const holdProps = (d: number) => ({
    onPress: () => {
      haptics.light();
      step(d);
    },
    onLongPress: () => {
      stop();
      timer.current = setInterval(() => step(d), 90);
    },
    delayLongPress: 400,
    onPressOut: stop,
  });

  const btn = (d: number, icon: React.ReactNode, name: string) => (
    <Pressable
      {...holdProps(d)}
      accessibilityRole="button"
      accessibilityLabel={`${name} ${label}`}
      style={({ pressed }) => [styles.stepBtn, { backgroundColor: SideColors[side].fg, opacity: pressed ? 0.8 : 1 }]}
    >
      {icon}
    </Pressable>
  );

  return (
    <View style={styles.stepper}>
      {btn(-1, <Minus size={26} color="#fff" strokeWidth={3} />, 'Minus')}
      <TextInput
        value={String(value)}
        onChangeText={(t) => {
          const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
          onChange(Number.isNaN(n) ? 0 : Math.min(max, n));
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={`${label} score`}
        style={[styles.stepInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      />
      {btn(1, <Plus size={26} color="#fff" strokeWidth={3} />, 'Plus')}
    </View>
  );
}

// ─── Screen body ─────────────────────────────────────────────────────────────────────────────────────────────

export function ResultEntry({
  match,
  rules,
  names,
  onDone,
  onClose,
}: {
  match: TournamentMatch;
  rules: LiveRules;
  names: Names;
  onDone: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const editing = match.status === 'completed' || match.status === 'walkover';
  const winnerSide: Side | null = match.winner_entry_id ? (match.winner_entry_id === match.entry_a?.id ? 'a' : match.winner_entry_id === match.entry_b?.id ? 'b' : null) : null;

  const [mode, setMode] = useState<'played' | 'walkover'>(match.status === 'walkover' ? 'walkover' : 'played');
  const [hist, setHist] = useState(() =>
    newFormHistory(editing ? formFromMatch(rules, { score_a: match.score_a, score_b: match.score_b, score_detail: match.score_detail, result_note: match.result_note, winnerSide }) : emptyForm(rules)),
  );
  const [wo, setWo] = useState<Side | null>(match.status === 'walkover' ? winnerSide : null);
  const [woNote, setWoNote] = useState('');
  const [showNote, setShowNote] = useState(!!hist.present.note);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = hist.present;
  const ev = useMemo(() => evaluateForm(form, rules, { names, drawAllowed: match.can_draw }), [form, rules, names, match.can_draw]);
  const blocker = saveBlocker(ev, form);
  const rowName = rules.family === 'tennis' ? 'Set' : rules.family === 'timed' ? 'Period' : 'Game';
  const rowLabel = (i: number) => (rules.family === 'timed' ? `P${i + 1}` : `${rowName} ${i + 1}`);

  const edit = (next: ResultForm) => setHist((h) => pushForm(h, next));
  const setRow = (i: number, side: Side, v: number) => edit({ ...form, rows: form.rows.map((r, idx) => (idx === i ? { ...r, [side]: v } : r)) });
  const idOf = (s: Side | null) => (s === 'a' ? match.entry_a?.id : s === 'b' ? match.entry_b?.id : null) ?? null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (mode === 'walkover') {
        if (!wo) return;
        await recordWalkover(match.id, idOf(wo)!, woNote.trim() || null);
      } else {
        const level = ev.scoreA === ev.scoreB && !ev.draw;
        await recordResult({
          matchId: match.id,
          scoreA: ev.scoreA,
          scoreB: ev.scoreB,
          scoreDetail: ev.detail,
          winnerEntryId: level ? idOf(ev.winner) : null,
          note: composeNote(ev, form),
        });
      }
      haptics.success();
      toast('Result saved', 'The bracket has been updated.');
      onDone();
    } catch (e) {
      haptics.error();
      setError(friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  const winnerButtons = (value: Side | null, set: (s: Side) => void) => (
    <View style={styles.row}>
      {(['a', 'b'] as Side[]).map((s) => (
        <BarButton key={s} label={names[s]} tone={value === s ? 'primary' : 'default'} style={{ flex: 1, minHeight: 64 }} onPress={() => set(s)} />
      ))}
    </View>
  );

  const nameHeader = (
    <View style={styles.row}>
      {(['a', 'b'] as Side[]).map((s) => (
        <View key={s} style={[styles.nameTag, { backgroundColor: SideColors[s].soft, borderColor: SideColors[s].fg }]}>
          <ThemedText numberOfLines={1} style={{ fontWeight: '800', color: SideColors[s].fg, textAlign: 'center' }}>
            {names[s]}
          </ThemedText>
        </View>
      ))}
    </View>
  );

  const rowsEditor = (
    <View style={{ gap: Spacing.sm }}>
      {nameHeader}
      {form.rows.map((r, i) => (
        <View key={i} style={{ gap: 4 }}>
          <ThemedText variant="caption" muted>
            {rowLabel(i)}
          </ThemedText>
          <View style={styles.row}>
            <Stepper value={r.a} side="a" label={`${rowLabel(i)} ${names.a}`} onChange={(v) => setRow(i, 'a', v)} />
            <Stepper value={r.b} side="b" label={`${rowLabel(i)} ${names.b}`} onChange={(v) => setRow(i, 'b', v)} />
          </View>
          {ev.hints.filter((h) => h.row === i).map((h, k) => (
            <ThemedText key={k} variant="caption" style={{ color: theme.warning }}>
              {h.text}
            </ThemedText>
          ))}
        </View>
      ))}
      <View style={styles.row}>
        {form.rows.length < maxRows(rules) && (
          <BarButton label={`Add ${rowName.toLowerCase()}`} icon={<Plus size={20} color={theme.text} />} style={{ flex: 1 }} onPress={() => edit({ ...form, rows: [...form.rows, { a: 0, b: 0 }] })} />
        )}
        {form.rows.length > startRows(rules) && (
          <BarButton label="Remove last" style={{ flex: 1 }} onPress={() => edit({ ...form, rows: form.rows.slice(0, -1) })} />
        )}
      </View>
    </View>
  );

  const totalsEditor = (
    <View style={{ gap: Spacing.sm }}>
      {nameHeader}
      <View style={styles.row}>
        <Stepper value={form.a} side="a" label={`${names.a} ${rules.family === 'cricket' ? 'runs' : 'score'}`} onChange={(v) => edit({ ...form, a: v })} />
        <Stepper value={form.b} side="b" label={`${names.b} ${rules.family === 'cricket' ? 'runs' : 'score'}`} onChange={(v) => edit({ ...form, b: v })} />
      </View>
    </View>
  );

  const played = (
    <View style={{ gap: Spacing.md }}>
      {(rules.family === 'sets' || rules.family === 'tennis') && rowsEditor}

      {rules.family === 'timed' && (
        <>
          {form.periodBreakdown ? rowsEditor : totalsEditor}
          <BarButton
            label={form.periodBreakdown ? 'Use one total instead' : 'Add period breakdown'}
            onPress={() => edit({ ...form, periodBreakdown: !form.periodBreakdown, rows: form.periodBreakdown ? form.rows : form.rows.length ? form.rows : emptyForm(rules).rows })}
          />
          {ev.scoreA === ev.scoreB && !match.can_draw && rules.shootout !== 'none' && (
            <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={{ fontWeight: '700' }}>{rules.shootout === 'seven_metre' ? '7 m throws' : 'Penalties'} (if played)</ThemedText>
              <View style={styles.row}>
                <Stepper value={form.pensA} side="a" label={`${names.a} penalties`} onChange={(v) => edit({ ...form, pensA: v })} />
                <Stepper value={form.pensB} side="b" label={`${names.b} penalties`} onChange={(v) => edit({ ...form, pensB: v })} />
              </View>
            </View>
          )}
        </>
      )}

      {rules.family === 'cricket' && (
        <>
          {totalsEditor}
          <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
            <ThemedText variant="label" muted>
              Wickets lost · overs faced (for the note)
            </ThemedText>
            <View style={styles.row}>
              {(['a', 'b'] as Side[]).map((s) => (
                <View key={s} style={{ flex: 1, gap: 6 }}>
                  <Stepper value={s === 'a' ? form.wktA : form.wktB} side={s} label={`${names[s]} wickets`} max={rules.wickets} onChange={(v) => edit({ ...form, [s === 'a' ? 'wktA' : 'wktB']: v })} />
                  <TextInput
                    value={s === 'a' ? form.oversA : form.oversB}
                    onChangeText={(t) => setHist((h) => replaceForm(h, { ...h.present, [s === 'a' ? 'oversA' : 'oversB']: t }))}
                    placeholder="Overs e.g. 18.3"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="decimal-pad"
                    maxLength={5}
                    style={[styles.oversInput, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]}
                  />
                </View>
              ))}
            </View>
          </View>
        </>
      )}

      {rules.family === 'simple' && totalsEditor}

      {ev.hints.filter((h) => h.row === null).map((h, k) => (
        <Banner key={k} tone="warn" text={h.text} />
      ))}
      {ev.errors.map((t, k) => (
        <ThemedText key={k} style={{ color: theme.error, fontWeight: '700' }}>
          {t}
        </ThemedText>
      ))}

      <View style={[styles.outcome, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <ThemedText style={{ fontSize: 22, fontWeight: '900', textAlign: 'center' }}>{ev.outcome}</ThemedText>
      </View>

      {ev.needsWinner && (
        <View style={{ gap: Spacing.sm }}>
          <ThemedText style={{ fontWeight: '700' }}>Scores are level — who won?</ThemedText>
          {winnerButtons(form.winner, (s) => edit({ ...form, winner: s }))}
        </View>
      )}

      {showNote ? (
        <TextInput
          value={form.note}
          onChangeText={(t) => setHist((h) => replaceForm(h, { ...h.present, note: t }))}
          placeholder="Note (e.g. Retired hurt)"
          placeholderTextColor={theme.placeholder}
          maxLength={200}
          style={[styles.oversInput, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, minHeight: 52 }]}
        />
      ) : (
        <Pressable onPress={() => setShowNote(true)} accessibilityRole="button" hitSlop={8}>
          <ThemedText style={{ color: theme.accent, fontWeight: '700' }}>Add a note</ThemedText>
        </Pressable>
      )}
    </View>
  );

  const walkover = (
    <View style={{ gap: Spacing.md }}>
      <ThemedText style={{ fontWeight: '700' }}>Who advances?</ThemedText>
      {winnerButtons(wo, setWo)}
      <ThemedText variant="caption" muted>
        A walkover needs both sides in the bracket. The match is recorded without a score.
      </ThemedText>
      <TextInput
        value={woNote}
        onChangeText={setWoNote}
        placeholder="Walkover"
        placeholderTextColor={theme.placeholder}
        maxLength={200}
        style={[styles.oversInput, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground, minHeight: 52 }]}
      />
    </View>
  );

  const canSave = !saving && (mode === 'walkover' ? !!wo : !blocker);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={[styles.top, { borderBottomColor: theme.border }]}>
        <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={styles.iconBtn}>
          <X size={26} color={theme.text} />
        </Pressable>
        <View style={styles.flex}>
          <ThemedText style={{ fontWeight: '800', fontSize: 17 }} numberOfLines={1}>
            {editing ? 'Edit result' : 'Enter result'}
          </ThemedText>
          <ThemedText variant="caption" muted numberOfLines={1}>
            {match.group_letter ? `Group ${match.group_letter} · ` : ''}
            {matchTitle(match)} · {names.a} vs {names.b}
          </ThemedText>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { value: 'played', label: 'Played' },
            { value: 'walkover', label: 'Walkover' },
          ]}
        />
        {mode === 'played' ? played : walkover}
        {error ? (
          <ThemedText style={{ color: theme.error, fontWeight: '700' }} accessibilityLiveRegion="polite">
            {error}
          </ThemedText>
        ) : null}
      </ScrollView>

      <View style={[styles.bottom, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
        {mode === 'played' && !confirmClear && (
          <View style={styles.row}>
            <BarButton label="Undo" icon={<Undo2 size={20} color={theme.text} />} disabled={hist.past.length === 0} style={{ flex: 1 }} onPress={() => setHist(undoForm)} />
            <BarButton label="Redo" icon={<Redo2 size={20} color={theme.text} />} disabled={hist.future.length === 0} style={{ flex: 1 }} onPress={() => setHist(redoForm)} />
            <BarButton label="Clear" disabled={hist.past.length === 0 && !editing} style={{ flex: 1 }} onPress={() => setConfirmClear(true)} />
          </View>
        )}
        {confirmClear && (
          <View style={styles.row}>
            <ThemedText style={{ flex: 1, fontWeight: '700', alignSelf: 'center' }}>Clear all scores?</ThemedText>
            <BarButton label="Clear" tone="danger" onPress={() => { edit(emptyForm(rules)); setConfirmClear(false); }} />
            <BarButton label="Cancel" onPress={() => setConfirmClear(false)} />
          </View>
        )}
        <BarButton
          label={saving ? 'Saving…' : mode === 'walkover' ? 'Record walkover' : 'Save result'}
          tone="primary"
          disabled={!canSave}
          style={{ minHeight: 64 }}
          onPress={() => void save()}
        />
        {!canSave && !saving ? (
          <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
            {mode === 'walkover' ? 'Pick who advances.' : blocker}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.md, gap: Spacing.md, paddingBottom: Spacing.xl, width: '100%', maxWidth: 640, alignSelf: 'center' },
  bottom: { padding: Spacing.sm, gap: Spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  nameTag: { flex: 1, borderRadius: Radius.md, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 8 },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 56, height: 56, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, minWidth: 48, height: 56, borderRadius: Radius.md, borderWidth: 1, textAlign: 'center', fontSize: 26, fontWeight: '900', padding: 0 },
  box: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  outcome: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
  oversInput: { minHeight: 44, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
});
