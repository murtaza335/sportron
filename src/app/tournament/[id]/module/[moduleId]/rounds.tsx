import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { FormField, PillSelect, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentModule } from '@/hooks/useTournamentModule';
import { alert } from '@/lib/alert';
import { toast } from '@/components/motion/Toast';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { bestOfLabel, formatMatchTime } from '@/lib/tournamentFormat';
import { updateRound } from '@/services/tournaments';
import type { TournamentRound } from '@/types';

const BEST_OF = [1, 3, 5, 7].map((n) => ({ value: n, label: String(n) }));

export default function RoundsScreen() {
  const { moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const m = useTournamentModule(moduleId);
  const [openId, setOpenId] = useState<string | null>(null);

  if (m.loading && !m.module) return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />;
  if (!m.module || !m.isModuleAdmin) {
    return (
      <View style={styles.denied}>
        <ThemedText variant="heading">No access</ThemedText>
        <ThemedText muted>Only module admins can edit rounds.</ThemedText>
      </View>
    );
  }

  const locked = m.module.status === 'completed' || m.module.status === 'cancelled';

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      {m.rounds.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText variant="heading">No rounds yet</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>Rounds are created when you generate the bracket.</ThemedText>
        </View>
      ) : (
        m.rounds.map((r) => (
          <RoundRow
            key={r.id}
            round={r}
            open={openId === r.id}
            disabled={locked}
            onToggle={() => setOpenId(openId === r.id ? null : r.id)}
            onSaved={async () => {
              await m.refresh();
            }}
          />
        ))
      )}
    </ScrollView>
  );
}

function RoundRow({
  round,
  open,
  disabled,
  onToggle,
  onSaved,
}: {
  round: TournamentRound;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  onSaved: () => Promise<void>;
}) {
  const theme = useTheme();
  const [name, setName] = useState(round.name);
  const [bestOf, setBestOf] = useState<number>(round.best_of);
  const [notes, setNotes] = useState(round.rules_text ?? '');
  const [start, setStart] = useState<Date | null>(round.scheduled_start ? new Date(round.scheduled_start) : null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) {
      alert('Name required', 'Give the round a name.');
      return;
    }
    setSaving(true);
    try {
      await updateRound(round.id, {
        name: name.trim(),
        best_of: bestOf,
        rules_text: notes.trim() || null,
        scheduled_start: start ? start.toISOString() : null,
      });
      await onSaved();
      toast('Saved', `${name.trim()} updated.`);
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Pressable onPress={onToggle} style={styles.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <View style={{ flex: 1 }}>
          <ThemedText style={{ fontWeight: '600' }}>{round.name}</ThemedText>
          <ThemedText variant="caption" muted>
            {[bestOfLabel(round.best_of), formatMatchTime(round.scheduled_start)].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
        {open ? <ChevronDown size={18} color={theme.textSecondary} /> : <ChevronRight size={18} color={theme.textSecondary} />}
      </Pressable>
      {open && (
        <View style={styles.body}>
          <FormField label="Name">
            <TextField value={name} onChangeText={setName} maxLength={40} editable={!disabled} />
          </FormField>
          <FormField label="Best of">
            <PillSelect options={BEST_OF} value={bestOf} onChange={setBestOf} disabled={disabled} />
          </FormField>
          <FormField label="Start">
            <DateTimeField value={start} onChange={setStart} />
          </FormField>
          <FormField label="Notes">
            <TextField value={notes} onChangeText={setNotes} multiline maxLength={500} editable={!disabled} />
          </FormField>
          {!disabled && <Button label="Save round" onPress={save} loading={saving} />}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  denied: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.sm },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xl },
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  body: { padding: Spacing.md, paddingTop: 0, gap: Spacing.md },
});
