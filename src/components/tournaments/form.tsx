import { X } from 'lucide-react-native';
import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Label + control + optional error, matching the create-community field recipe. */
export function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText variant="label" muted style={styles.label}>{label}</ThemedText>
      {children}
      {hint && !error && <ThemedText variant="caption" muted style={styles.label}>{hint}</ThemedText>}
      {error && <ThemedText variant="caption" style={[styles.label, { color: theme.error }]}>{error}</ThemedText>}
    </View>
  );
}

export const TextField = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(function TextField(
  { style, invalid, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.placeholder}
      multiline={multiline}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[
        styles.input,
        multiline && styles.textArea,
        {
          color: theme.text,
          backgroundColor: theme.inputBackground,
          borderColor: invalid ? theme.error : focused ? theme.inputBorderFocus : theme.inputBorder,
        },
        style,
      ]}
      {...rest}
    />
  );
});

/** Capsule choice row (sport pills, field types, best-of…). Selected = text fill + background label. */
export function PillSelect<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.pills}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            disabled={disabled}
            style={({ pressed }) => [
              styles.pill,
              { borderColor: theme.border },
              sel && { backgroundColor: theme.text, borderColor: theme.text },
              disabled && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: sel, disabled: !!disabled }}
          >
            <ThemedText variant="caption" style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1 }}>
        <ThemedText variant="body" style={{ fontWeight: '600' }}>{label}</ThemedText>
        {hint && <ThemedText variant="caption" muted>{hint}</ThemedText>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: theme.accent, false: theme.border }}
      />
    </View>
  );
}

/** Full-screen modal header: X left · title centre · spacer right. */
export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.6 }} accessibilityLabel="Close">
        <X size={24} color={theme.text} strokeWidth={2} />
      </Pressable>
      <ThemedText variant="heading">{title}</ThemedText>
      <View style={{ width: 24 }} />
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <ThemedText variant="label" muted>{children}</ThemedText>;
}

const styles = StyleSheet.create({
  field: { gap: Spacing.xs },
  label: { marginLeft: Spacing.xs },
  input: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 16,
    lineHeight: 24,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: { borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
});
