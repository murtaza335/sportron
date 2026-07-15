import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { UserRole } from '@/types';

type ProfileFormProps = {
  initialName?: string;
  initialBio?: string;
  initialRole?: UserRole;
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (data: { displayName: string; bio: string; role: UserRole }) => void;
};

export function ProfileForm({
  initialName = '',
  initialBio = '',
  initialRole = 'student',
  submitLabel = 'Continue',
  loading = false,
  onSubmit,
}: ProfileFormProps) {
  const theme = useTheme();
  const [displayName, setDisplayName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [role, setRole] = useState<UserRole>(initialRole);

  const canSubmit = displayName.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <ThemedText variant="label" muted>
          Name
        </ThemedText>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Your name"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text, borderColor: theme.border }]}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.field}>
        <ThemedText variant="label" muted>
          Bio (optional)
        </ThemedText>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="A short bio"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, styles.textArea, { color: theme.text, borderColor: theme.border }]}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.field}>
        <ThemedText variant="label" muted>
          Role
        </ThemedText>
        <View style={[styles.roleRow, { borderColor: theme.border }]}>
          {(['student', 'teacher'] as UserRole[]).map((option) => {
            const selected = role === option;
            return (
              <Pressable
                key={option}
                onPress={() => setRole(option)}
                style={[
                  styles.roleOption,
                  selected && { backgroundColor: theme.text },
                ]}>
                <ThemedText
                  variant="body"
                  style={{
                    color: selected ? theme.background : theme.text,
                    fontWeight: '700',
                    textTransform: 'capitalize',
                  }}>
                  {option}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button
        label={submitLabel}
        loading={loading}
        disabled={!canSubmit}
        onPress={() =>
          onSubmit({
            displayName: displayName.trim(),
            bio: bio.trim(),
            role,
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
  },
  field: {
    gap: Spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  roleRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  roleOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
});
