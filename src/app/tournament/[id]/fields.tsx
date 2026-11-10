import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from 'lucide-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryFieldEditorSheet } from '@/components/tournaments/EntryFieldEditorSheet';
import { SectionLabel } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentFields } from '@/hooks/useTournamentFields';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { FIELD_TYPE_LABELS } from '@/lib/tournamentFormat';
import { archiveEntryField, reorderEntryFields, upsertEntryField } from '@/services/tournaments';
import type { EntryFieldInput, TournamentEntryField } from '@/types';

export default function TournamentFieldsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { loading: tLoading, isTournamentAdmin, detail } = useTournament(id);
  const { fields, loading, reload } = useTournamentFields(id);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<TournamentEntryField | null>(null);
  const [saving, setSaving] = useState(false);

  const core = fields.filter((f) => f.is_core);
  const custom = fields.filter((f) => !f.is_core);
  const writable = detail?.tournament.status !== 'completed' && detail?.tournament.status !== 'cancelled';

  const openEditor = (f: TournamentEntryField | null) => {
    setEditing(f);
    setEditorOpen(true);
  };

  const save = async (input: EntryFieldInput) => {
    setSaving(true);
    try {
      await upsertEntryField(id, input);
      setEditorOpen(false);
      await reload();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = (f: TournamentEntryField) => {
    alert('Remove field?', `“${f.label}”: existing answers are kept but hidden.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveEntryField(f.id);
            await reload();
          } catch (e) {
            alert('Something went wrong', friendlyTournamentError(e));
          }
        },
      },
    ]);
  };

  const move = async (f: TournamentEntryField, dir: -1 | 1) => {
    const idx = custom.findIndex((c) => c.id === f.id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= custom.length) return;
    const newCustom = [...custom];
    [newCustom[idx], newCustom[swapIdx]] = [newCustom[swapIdx], newCustom[idx]];
    try {
      await reorderEntryFields(id, [...core, ...newCustom].map((x) => x.id));
      await reload();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    }
  };

  if (loading || tLoading) {
    return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />;
  }
  if (!isTournamentAdmin) {
    return (
      <View style={styles.denied}>
        <ThemedText variant="heading">No access</ThemedText>
        <ThemedText muted>Only tournament admins can edit the entry form.</ThemedText>
      </View>
    );
  }

  const meta = (f: TournamentEntryField) =>
    [FIELD_TYPE_LABELS[f.field_type], f.is_public ? 'Public' : 'Private', f.is_required && !f.is_core ? 'Required' : null]
      .filter(Boolean)
      .join(' · ');

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}>
        <SectionLabel>Core fields (required for all)</SectionLabel>
        <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          {core.map((f, i) => (
            <Pressable
              key={f.id}
              onPress={() => writable && openEditor(f)}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${f.label}`}
            >
              <Lock size={16} color={theme.textSecondary} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontWeight: '600' }}>{f.label}</ThemedText>
                <ThemedText variant="caption" muted>{meta(f)}</ThemedText>
              </View>
            </Pressable>
          ))}
        </View>

        <SectionLabel>Custom fields</SectionLabel>
        {custom.length === 0 ? (
          <ThemedText muted>No custom fields yet. Add ones like Department or T-shirt size.</ThemedText>
        ) : (
          <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {custom.map((f, i) => (
              <View key={f.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <Pressable
                  onPress={() => writable && openEditor(f)}
                  style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${f.label}`}
                >
                  <ThemedText style={{ fontWeight: '600' }}>{f.label}</ThemedText>
                  <ThemedText variant="caption" muted>{meta(f)}</ThemedText>
                </Pressable>
                {writable && (
                  <View style={styles.actions}>
                    <Pressable onPress={() => move(f, -1)} hitSlop={8} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} accessibilityLabel="Move up">
                      <ArrowUp size={18} color={theme.text} strokeWidth={2} />
                    </Pressable>
                    <Pressable onPress={() => move(f, 1)} hitSlop={8} disabled={i === custom.length - 1} style={{ opacity: i === custom.length - 1 ? 0.3 : 1 }} accessibilityLabel="Move down">
                      <ArrowDown size={18} color={theme.text} strokeWidth={2} />
                    </Pressable>
                    <Pressable onPress={() => remove(f)} hitSlop={8} accessibilityLabel={`Remove ${f.label}`}>
                      <Trash2 size={18} color={theme.error} strokeWidth={2} />
                    </Pressable>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}

        {writable && (
          <Button label="Add field" variant="secondary" icon={<Plus size={18} color={theme.text} />} onPress={() => openEditor(null)} />
        )}
      </ScrollView>

      <EntryFieldEditorSheet
        visible={editorOpen}
        field={editing}
        existingKeys={fields.map((f) => f.key)}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onSave={save}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  denied: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  card: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
