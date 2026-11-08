import { X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { EntryFieldControl } from '@/components/tournaments/EntryFieldControl';
import { FormField, SwitchRow, TextField } from '@/components/tournaments/form';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ProfileLite, TournamentEntryField } from '@/types';

/** Local (unsaved) roster member while the team form is open. */
export type MemberDraft = {
  /** Local React key. */
  key: string;
  /** Server id when the member already exists. */
  id?: string;
  name: string;
  profile: ProfileLite | null;
  values: Record<string, string>;
  is_captain: boolean;
  /** Raw text of the squad number ('' = none). */
  squad: string;
};

export function emptyMember(key: string): MemberDraft {
  return { key, name: '', profile: null, values: {}, is_captain: false, squad: '' };
}

/**
 * One roster member's details. Controlled: edits go straight to the parent draft, so the sheet can
 * be hidden (while the user picker is open — no nested modals) and reopened without losing input.
 */
export function MemberSheet({
  visible,
  title,
  member,
  fields,
  errors,
  showSquad,
  showCaptain,
  onChange,
  onPickUser,
  onClose,
}: {
  visible: boolean;
  title: string;
  member: MemberDraft | null;
  fields: TournamentEntryField[];
  errors: Record<string, string>;
  showSquad: boolean;
  showCaptain: boolean;
  onChange: (patch: Partial<MemberDraft>) => void;
  onPickUser: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const nameField = fields.find((f) => f.key === 'name');
  const others = fields.filter((f) => f.key !== 'name');

  return (
    <BottomSheet visible={visible && !!member} onClose={onClose}>
      {member && (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">{title}</ThemedText>

          <FormField label={`${nameField?.label ?? 'Name'} *`} error={errors.name}>
            <TextField
              value={member.name}
              onChangeText={(v) => onChange({ name: v })}
              placeholder={nameField?.placeholder ?? undefined}
              maxLength={60}
              invalid={!!errors.name}
              autoCapitalize="words"
              autoFocus={!member.name}
            />
          </FormField>

          {others.map((f) => (
            <EntryFieldControl
              key={f.id}
              field={f}
              value={member.values[f.key] ?? ''}
              error={errors[f.key]}
              onChange={(v) => onChange({ values: { ...member.values, [f.key]: v } })}
            />
          ))}

          <FormField label="Link app user (optional)" hint="Linked users get notifications for their team.">
            {member.profile ? (
              <View style={[styles.linked, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <UserAvatar avatarUrl={member.profile.avatar_url} size={28} />
                <ThemedText style={{ flex: 1, fontWeight: '600' }}>@{member.profile.username}</ThemedText>
                <Pressable onPress={() => onChange({ profile: null })} hitSlop={10} accessibilityLabel="Unlink user">
                  <X size={18} color={theme.textSecondary} strokeWidth={2} />
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={onPickUser} accessibilityRole="button">
                <View pointerEvents="none">
                  <TextField editable={false} placeholder="Search username…" value="" />
                </View>
              </Pressable>
            )}
          </FormField>

          {showCaptain && (
            <SwitchRow
              label="Captain"
              hint="One captain per team."
              value={member.is_captain}
              onChange={(v) => onChange({ is_captain: v })}
            />
          )}

          {showSquad && (
            <FormField label="Squad number" error={errors.squad_number}>
              <TextField
                value={member.squad}
                onChangeText={(v) => onChange({ squad: v.replace(/[^0-9]/g, '').slice(0, 2) })}
                keyboardType="number-pad"
                placeholder="0–99 (optional)"
                maxLength={2}
                invalid={!!errors.squad_number}
              />
            </FormField>
          )}

          <Button label="Done" onPress={onClose} />
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingBottom: Spacing.md },
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
});
