import { Minus, Plus, X } from 'lucide-react-native';
import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { haptics } from '@/lib/haptics';
import { Duration, RM } from '@/lib/motion';


import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

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
  const reduced = useReducedMotion();
  const shake = useSharedValue(0);

  // A new error shakes the field horizontally once (±6px, ~300ms) with an error haptic.
  useEffect(() => {
    if (!error) return;
    haptics.error();
    if (reduced) return;
    shake.set(
      withSequence(
        withTiming(-6, { duration: 50 }),
        withTiming(6, { duration: 70 }),
        withTiming(-4, { duration: 70 }),
        withTiming(4, { duration: 60 }),
        withTiming(0, { duration: 50 }),
      ),
    );
  }, [error, reduced, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <View style={styles.field}>
      <ThemedText variant="label" muted style={styles.label}>{label}</ThemedText>
      <Animated.View style={shakeStyle}>{children}</Animated.View>
      {hint && !error && <ThemedText variant="caption" muted style={styles.label}>{hint}</ThemedText>}
      {error && (
        <Animated.View entering={FadeInDown.duration(Duration.fast).reduceMotion(RM)}>
          <ThemedText variant="caption" style={[styles.label, { color: theme.error }]}>{error}</ThemedText>
        </Animated.View>
      )}
    </View>
  );
}

export const TextField = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(function TextField(
  { style, invalid, onFocus, onBlur, multiline, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const borderStyle = useAnimatedStyle(
    () => ({
      borderColor: withTiming(invalid ? theme.error : focused ? theme.inputBorderFocus : theme.inputBorder, {
        duration: Duration.fast,
      }),
    }),
    [invalid, focused, theme.error, theme.inputBorderFocus, theme.inputBorder],
  );
  return (
    <AnimatedTextInput
      ref={ref as never}
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
        },
        borderStyle,
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
          <PressableScale
            key={String(o.value)}
            onPress={() => {
              if (!sel) haptics.selection();
              onChange(o.value);
            }}
            scaleTo={0.94}
            disabled={disabled}
            style={[
              styles.pill,
              { borderColor: theme.border },
              sel && { backgroundColor: theme.text, borderColor: theme.text },
              disabled && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: sel, disabled: !!disabled }}
          >
            <ThemedText variant="caption" style={{ fontWeight: '700', color: sel ? theme.background : theme.text }}>
              {o.label}
            </ThemedText>
          </PressableScale>
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

/** Compact − [n] + control with a min/max clamp (roster size, points, group counts). */
export function NumberStepper({
  value,
  onChange,
  min,
  max,
  label,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  return (
    <View
      style={[
        styles.stepper,
        { borderColor: theme.border, backgroundColor: theme.background },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Pressable
        onPress={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        hitSlop={8}
        style={[styles.stepBtn, value <= min && { opacity: 0.35 }]}
        accessibilityLabel={`${label} minus`}
      >
        <Minus size={18} color={theme.text} strokeWidth={2.5} />
      </Pressable>
      <TextInput
        value={String(value)}
        editable={!disabled}
        onChangeText={(t) => {
          const n = parseInt(t.replace(/[^0-9]/g, ''), 10);
          onChange(Number.isNaN(n) ? min : clamp(n));
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        style={[styles.stepInput, { color: theme.text }]}
        accessibilityLabel={label}
      />
      <Pressable
        onPress={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        hitSlop={8}
        style={[styles.stepBtn, value >= max && { opacity: 0.35 }]}
        accessibilityLabel={`${label} plus`}
      >
        <Plus size={18} color={theme.text} strokeWidth={2.5} />
      </Pressable>
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
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    alignSelf: 'flex-start',
  },
  stepBtn: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  stepInput: { minWidth: 44, textAlign: 'center', fontSize: 16, fontWeight: '700', paddingVertical: 6 },
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
