import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { FormField, PillSelect, SwitchRow, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { FIELD_TYPE_LABELS, slugifyFieldKey } from '@/lib/tournamentFormat';
import type { EntryFieldInput, EntryFieldType, TournamentEntryField } from '@/types';

const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABELS) as EntryFieldType[]).map((t) => ({
  value: t,
  label: FIELD_TYPE_LABELS[t],
}));

/** Bottom sheet to add / edit an entry-form field (PLAN §12.7). Core fields: label + placeholder only. */
export function EntryFieldEditorSheet({
  visible,
  field,
  existingKeys,
  saving,
  onClose,
  onSave,
}: {
  visible: boolean;
  field: TournamentEntryField | null;
  existingKeys: string[];
  saving: boolean;
  onClose: () => void;
  onSave: (input: EntryFieldInput) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {visible && (
        <EditorBody
          key={field?.id ?? 'new'}
          field={field}
          existingKeys={existingKeys}
          saving={saving}
          onSave={onSave}
        />
      )}
    </BottomSheet>
  );
}

function EditorBody({
  field,
  existingKeys,
  saving,
  onSave,
}: {
  /** null → create a new custom field */
  field: TournamentEntryField | null;
  existingKeys: string[];
  saving: boolean;
  onSave: (input: EntryFieldInput) => void;
}) {
  const theme = useTheme();
  const [label, setLabel] = useState(field?.label ?? '');
  const [type, setType] = useState<EntryFieldType>(field?.field_type ?? 'text');
  const [options, setOptions] = useState<string[]>(field?.options ?? []);
  const [newOption, setNewOption] = useState('');
  const [placeholder, setPlaceholder] = useState(field?.placeholder ?? '');
  const [required, setRequired] = useState(field?.is_required ?? false);
  const [isPublic, setIsPublic] = useState(field?.is_public ?? false);
  const [error, setError] = useState<string | null>(null);

  const core = !!field?.is_core;

  const addOption = () => {
    const v = newOption.trim();
    if (!v) return;
    if (options.includes(v)) return;
    if (options.length >= 20) {
      setError('You can add up to 20 options.');
      return;
    }
    setOptions([...options, v]);
    setNewOption('');
    setError(null);
  };

  const submit = () => {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('Label is required.');
      return;
    }
    if (type === 'select' && !core && options.length === 0) {
      setError('Add at least one option.');
      return;
    }
    let key = field?.key ?? slugifyFieldKey(trimmed);
    if (!field) {
      let n = 2;
      const base = key;
      while (existingKeys.includes(key)) key = `${base.slice(0, 36)}_${n++}`;
    }
    onSave({
      id: field?.id ?? null,
      key,
      label: trimmed,
      field_type: type,
      options: type === 'select' ? options : null,
      placeholder: placeholder.trim() || null,
      is_required: core ? true : required,
      is_public: core ? field!.is_public : isPublic,
      sort_order: null,
    });
  };

  return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
          {field ? (core ? 'Edit core field' : 'Edit field') : 'Add field'}
        </ThemedText>

        <FormField label="Label" error={error}>
          <TextField value={label} onChangeText={setLabel} placeholder="e.g. Department" maxLength={40} />
        </FormField>

        {!core && (
          <FormField label="Type">
            <PillSelect options={TYPE_OPTIONS} value={type} onChange={setType} />
          </FormField>
        )}

        {type === 'select' && !core && (
          <FormField label="Options">
            <View style={styles.optionList}>
              {options.map((o) => (
                <View key={o} style={[styles.option, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText variant="caption" style={{ fontWeight: '600' }}>{o}</ThemedText>
                  <Pressable onPress={() => setOptions(options.filter((x) => x !== o))} hitSlop={8} accessibilityLabel={`Remove ${o}`}>
                    <X size={14} color={theme.textSecondary} strokeWidth={2.5} />
                  </Pressable>
                </View>
              ))}
            </View>
            <View style={styles.addOption}>
              <TextField
                value={newOption}
                onChangeText={setNewOption}
                placeholder="New option"
                maxLength={40}
                onSubmitEditing={addOption}
                style={{ flex: 1 }}
              />
              <Button label="Add" variant="secondary" onPress={addOption} buttonStyle={{ minHeight: 52 }} />
            </View>
          </FormField>
        )}

        <FormField label="Placeholder (optional)">
          <TextField value={placeholder} onChangeText={setPlaceholder} maxLength={60} />
        </FormField>

        {!core && (
          <>
            <SwitchRow label="Required" value={required} onChange={setRequired} />
            <SwitchRow
              label="Visible to everyone"
              hint="Off = only admins and the entrant"
              value={isPublic}
              onChange={setIsPublic}
            />
          </>
        )}

        <Button label="Save field" onPress={submit} loading={saving} />
      </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingBottom: Spacing.md },
  optionList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 6 },
  addOption: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: Spacing.sm },
});
