import { Minus, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { FormField, PillSelect, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { matchTitle } from '@/lib/tournamentFormat';
import { recordResult, recordWalkover } from '@/services/tournaments';
import type { ScoreDetailRow, Sport, TournamentMatch } from '@/types';
import { isRacketSport } from '@/types';

/** Compact −/value/+ stepper with direct numeric input (the hero ScoreCounter is too tall for game rows). */
function MiniStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.background }]}>
      <Pressable onPress={() => onChange(Math.max(0, value - 1))} hitSlop={8} style={styles.stepBtn} accessibilityLabel={`${label} minus`}>
        <Minus size={18} color={theme.text} strokeWidth={2.5} />
      </Pressable>
      <TextInput
        value={String(value)}
        onChangeText={(t) => {
          const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
          onChange(Number.isNaN(n) ? 0 : Math.min(n, 999));
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        style={[styles.stepInput, { color: theme.text }]}
        accessibilityLabel={`${label} score`}
      />
      <Pressable onPress={() => onChange(value + 1)} hitSlop={8} style={styles.stepBtn} accessibilityLabel={`${label} plus`}>
        <Plus size={18} color={theme.text} strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

type Mode = 'played' | 'walkover';

export function ResultEntrySheet({
  match,
  sport,
  onClose,
  onSaved,
}: {
  match: TournamentMatch | null;
  sport: Sport;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  return (
    <BottomSheet visible={!!match} onClose={onClose}>
      {match && <ResultBody key={match.id + match.status} match={match} sport={sport} onClose={onClose} onSaved={onSaved} />}
    </BottomSheet>
  );
}

function ResultBody({
  match,
  sport,
  onClose,
  onSaved,
}: {
  match: TournamentMatch;
  sport: Sport;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const racket = isRacketSport(sport);
  const a = match.entry_a!;
  const b = match.entry_b!;
  const bestOf = Math.max(match.best_of, 1);
  const minGames = racket ? Math.ceil(bestOf / 2) : 1;

  const initialGames: ScoreDetailRow[] =
    match.score_detail && match.score_detail.length > 0
      ? match.score_detail
      : Array.from({ length: racket ? minGames : 1 }, () => ({ a: 0, b: 0 }));

  const [mode, setMode] = useState<Mode>(match.status === 'walkover' ? 'walkover' : 'played');
  const [games, setGames] = useState<ScoreDetailRow[]>(initialGames);
  const [single, setSingle] = useState({ a: match.score_a ?? 0, b: match.score_b ?? 0 });
  const [winner, setWinner] = useState<string | null>(match.winner_entry_id);
  const [note, setNote] = useState(match.result_note && match.result_note !== 'Walkover' ? match.result_note : '');
  const [saving, setSaving] = useState(false);

  const played = racket ? games.filter((g) => g.a !== 0 || g.b !== 0) : [];
  const gamesA = played.filter((g) => g.a > g.b).length;
  const gamesB = played.filter((g) => g.b > g.a).length;
  const scoreA = racket ? gamesA : single.a;
  const scoreB = racket ? gamesB : single.b;
  const tie = scoreA === scoreB;
  const levelGame = racket && played.some((g) => g.a === g.b);
  /** League / group match with draws on: a level score is simply a draw, no winner to pick. */
  const drawOk = match.can_draw && tie && !levelGame;

  const setGame = (i: number, side: 'a' | 'b', v: number) =>
    setGames((prev) => prev.map((g, idx) => (idx === i ? { ...g, [side]: v } : g)));

  const winnerOptions = [
    { value: a.id, label: a.name },
    { value: b.id, label: b.name },
  ];

  const save = async () => {
    setSaving(true);
    try {
      if (mode === 'walkover') {
        if (!winner) {
          alert('Pick the winner', 'Choose who advances.');
          return;
        }
        await recordWalkover(match.id, winner, note.trim() || null);
      } else {
        if (levelGame) {
          alert('Check the games', 'A game can’t end level — fix the scores.');
          return;
        }
        if (racket && played.length === 0) {
          alert('Enter a score', 'Add at least one game score.');
          return;
        }
        if (tie && !winner && !match.can_draw) {
          alert('Scores are level', 'Pick the winner.');
          return;
        }
        await recordResult({
          matchId: match.id,
          scoreA,
          scoreB,
          scoreDetail: racket ? played : null,
          winnerEntryId: tie && !match.can_draw ? winner : null,
          note: note.trim() || null,
        });
      }
      await onSaved();
      onClose();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
        {match.status === 'completed' || match.status === 'walkover' ? 'Edit result' : 'Enter result'} ·{' '}
        {match.group_letter ? `Group ${match.group_letter} · ` : ''}{matchTitle(match)}
        {bestOf > 1 ? ` · Bo${bestOf}` : ''}
      </ThemedText>

      <SegmentedControl
        compact
        value={mode}
        onChange={(v) => {
          setMode(v);
          setWinner(v === 'walkover' ? null : match.winner_entry_id);
        }}
        options={[
          { value: 'played', label: 'Played' },
          { value: 'walkover', label: 'Walkover' },
        ]}
      />

      {mode === 'played' ? (
        <>
          <View style={styles.names}>
            <View style={{ flex: 1 }}><ThemedText variant="caption" muted numberOfLines={1} style={{ textAlign: 'center' }}>{a.name}</ThemedText></View>
            <View style={{ width: 24 }} />
            <View style={{ flex: 1 }}><ThemedText variant="caption" muted numberOfLines={1} style={{ textAlign: 'center' }}>{b.name}</ThemedText></View>
          </View>

          {racket ? (
            <>
              {games.map((g, i) => (
                <View key={i} style={styles.gameRow}>
                  <MiniStepper label={`Game ${i + 1} ${a.name}`} value={g.a} onChange={(v) => setGame(i, 'a', v)} />
                  <ThemedText variant="caption" muted style={{ width: 24, textAlign: 'center' }}>G{i + 1}</ThemedText>
                  <MiniStepper label={`Game ${i + 1} ${b.name}`} value={g.b} onChange={(v) => setGame(i, 'b', v)} />
                </View>
              ))}
              {games.length < bestOf && (
                <Button
                  label="Add game"
                  variant="ghost"
                  onPress={() => setGames((p) => [...p, { a: 0, b: 0 }])}
                  buttonStyle={{ minHeight: 44 }}
                />
              )}
              <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
                Games: {gamesA} – {gamesB}
              </ThemedText>
            </>
          ) : (
            <View style={styles.gameRow}>
              <MiniStepper label={a.name} value={single.a} onChange={(v) => setSingle((s) => ({ ...s, a: v }))} />
              <ThemedText variant="caption" muted style={{ width: 24, textAlign: 'center' }}>–</ThemedText>
              <MiniStepper label={b.name} value={single.b} onChange={(v) => setSingle((s) => ({ ...s, b: v }))} />
            </View>
          )}

          {tie && !levelGame && !drawOk && (
            <FormField label="Winner (scores are level)">
              <PillSelect options={winnerOptions} value={winner} onChange={setWinner} />
            </FormField>
          )}
          {drawOk && (
            <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
              Level score — recorded as a draw.
            </ThemedText>
          )}
        </>
      ) : (
        <FormField label="Winner" hint="Walkovers need both players present in the bracket. Pick who advances.">
          <PillSelect options={winnerOptions} value={winner} onChange={setWinner} />
        </FormField>
      )}

      <FormField label="Note (optional)">
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={mode === 'walkover' ? 'Walkover' : 'e.g. Won on penalties 4–3'}
          maxLength={200}
        />
      </FormField>

      <Button label={mode === 'walkover' ? 'Record walkover' : 'Save result'} onPress={save} loading={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingBottom: Spacing.md },
  names: { flexDirection: 'row', alignItems: 'center' },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xs,
    height: 52,
  },
  stepBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepInput: { flex: 1, textAlign: 'center', fontSize: 20, fontWeight: '700', padding: 0 },
});
