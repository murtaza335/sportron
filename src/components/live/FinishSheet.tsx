import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BarButton } from '@/components/live/parts';
import { SheetScrollView } from '@/components/motion/Sheet';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import type { OutboxStatus } from '@/lib/liveOutboxCore';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { useTheme } from '@/hooks/use-theme';
import type { MatchResult, Names, Side } from '@/lib/live';

/** Final confirmation: result summary, a winner pick only when the score can't decide it, optional note. */
export function FinishSheet({
  visible,
  names,
  result,
  status,
  onSave,
  onClose,
}: {
  visible: boolean;
  names: Names;
  result: MatchResult;
  status: OutboxStatus | null;
  onSave: (winner: Side | null, note: string | null) => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [picked, setPicked] = useState<Side | null>(null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const needsPick = result.needsWinner;
  const queued = !!status?.finishQueued;
  const detail = result.detail?.map((g) => `${g.a}–${g.b}`).join('  ·  ');
  const winner = result.winner ?? picked;
  const canSave = !queued && (!needsPick || !!picked);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight="90%">
      <SheetScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText variant="heading">Finish match</ThemedText>

        <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
          {(['a', 'b'] as Side[]).map((s) => (
            <View key={s} style={styles.line}>
              <View style={[styles.dot, { backgroundColor: SideColors[s].fg }]} />
              <ThemedText numberOfLines={1} style={{ flex: 1, fontWeight: winner === s ? '800' : '500' }}>
                {names[s]}
                {winner === s ? '  ✓' : ''}
              </ThemedText>
              <ThemedText style={{ fontSize: 26, fontWeight: '900' }}>{s === 'a' ? result.scoreA : result.scoreB}</ThemedText>
            </View>
          ))}
          {detail ? (
            <ThemedText variant="caption" muted>
              {detail}
            </ThemedText>
          ) : null}
          {result.note ? (
            <ThemedText variant="caption" muted>
              {result.note}
            </ThemedText>
          ) : null}
          {result.draw ? <ThemedText style={{ fontWeight: '700' }}>Finishes as a draw</ThemedText> : null}
        </View>

        {!result.decided && (
          <ThemedText style={{ color: theme.warning, fontWeight: '600' }}>The match isn’t finished by the rules — you’re ending it early.</ThemedText>
        )}

        {needsPick && (
          <View style={{ gap: Spacing.sm }}>
            <ThemedText style={{ fontWeight: '700' }}>Scores are level — who wins?</ThemedText>
            <View style={styles.row}>
              {(['a', 'b'] as Side[]).map((s) => (
                <BarButton
                  key={s}
                  label={names[s]}
                  tone={picked === s ? 'primary' : 'default'}
                  style={{ flex: 1 }}
                  onPress={() => setPicked(s)}
                />
              ))}
            </View>
          </View>
        )}

        {showNote ? (
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note (e.g. Retired hurt)"
            placeholderTextColor={theme.placeholder}
            maxLength={200}
            style={[styles.input, { color: theme.text, borderColor: theme.inputBorder, backgroundColor: theme.inputBackground }]}
          />
        ) : (
          <ThemedText onPress={() => setShowNote(true)} style={{ color: theme.accent, fontWeight: '700' }} accessibilityRole="button">
            Add a note
          </ThemedText>
        )}

        {status?.finishError ? (
          <ThemedText style={{ color: theme.error, fontWeight: '600' }}>{friendlyTournamentError(status.finishError)}</ThemedText>
        ) : null}

        {queued ? (
          <View style={[styles.box, { borderColor: theme.border }]}>
            <ThemedText style={{ fontWeight: '700' }}>{status?.phase === 'offline' ? 'Saved on this phone — will upload when you’re back online' : 'Saving result…'}</ThemedText>
            <ThemedText variant="caption" muted>
              You can leave this screen. The match stays safe on this phone until it uploads.
            </ThemedText>
            <BarButton label="Close" onPress={onClose} />
          </View>
        ) : (
          <BarButton
            label="Save result"
            tone="primary"
            disabled={!canSave}
            style={{ minHeight: 64 }}
            onPress={() => onSave(result.winner ?? picked, note.trim() ? note.trim().slice(0, 200) : null)}
          />
        )}
        {!queued && needsPick && !picked ? (
          <ThemedText variant="caption" muted>
            Pick the winner to save.
          </ThemedText>
        ) : null}
      </SheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingBottom: Spacing.lg },
  box: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  row: { flexDirection: 'row', gap: Spacing.sm },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.md, fontSize: 16 },
});
