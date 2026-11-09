import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CalendarDays, X } from 'lucide-react-native';
import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

function toLocalInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function display(d: Date): string {
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}

/**
 * Date + time picker. Native: date picker then time picker (as create-session.tsx);
 * web: a native `datetime-local` input (the datetimepicker package has no web support).
 */
export function DateTimeField({
  value,
  onChange,
  placeholder = 'Select date & time',
  clearable = true,
  min,
  max,
}: {
  value: Date | null;
  onChange: (d: Date | null) => void;
  placeholder?: string;
  clearable?: boolean;
  /** Web only: earliest / latest selectable moment. */
  min?: Date;
  max?: Date;
}) {
  const theme = useTheme();
  const [step, setStep] = useState<'date' | 'time' | null>(null);
  const [draft, setDraft] = useState<Date>(value ?? new Date());

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrap}>
        {createElement('input', {
          type: 'datetime-local',
          value: value ? toLocalInput(value) : '',
          ...(min ? { min: toLocalInput(min) } : {}),
          ...(max ? { max: toLocalInput(max) } : {}),
          onChange: (e: { target: { value: string } }) => {
            const v = e.target.value;
            onChange(v ? new Date(v) : null);
          },
          style: {
            flex: 1,
            borderRadius: Radius.md,
            border: `1px solid ${theme.inputBorder}`,
            backgroundColor: theme.inputBackground,
            color: theme.text,
            padding: Spacing.md,
            fontSize: 16,
            fontFamily: 'inherit',
            colorScheme: theme.resolvedColorScheme,
          },
        })}
      </View>
    );
  }

  const onPick = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      const current = step;
      if (event.type === 'dismissed') {
        setStep(null);
        return;
      }
      if (!date) {
        setStep(null);
        return;
      }
      if (current === 'date') {
        const next = new Date(draft);
        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setDraft(next);
        setStep('time');
      } else {
        const next = new Date(draft);
        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
        setDraft(next);
        setStep(null);
        onChange(next);
      }
      return;
    }
    // iOS: spinner updates continuously
    if (date) {
      setDraft(date);
      onChange(date);
    }
  };

  return (
    <View style={{ gap: Spacing.xs }}>
      <View style={styles.row}>
        <Pressable
          onPress={() => {
            setDraft(value ?? new Date());
            setStep(Platform.OS === 'ios' ? 'date' : 'date');
          }}
          style={({ pressed }) => [
            styles.field,
            { backgroundColor: theme.inputBackground, borderColor: theme.inputBorder },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
        >
          <CalendarDays size={18} color={theme.textSecondary} strokeWidth={2} />
          <ThemedText style={{ flex: 1, color: value ? theme.text : theme.textSecondary }}>
            {value ? display(value) : placeholder}
          </ThemedText>
        </Pressable>
        {clearable && value && (
          <Pressable onPress={() => onChange(null)} hitSlop={10} accessibilityLabel="Clear date">
            <X size={20} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
        )}
      </View>
      {step && (
        <DateTimePicker
          value={draft}
          mode={Platform.OS === 'ios' ? 'datetime' : step}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPick}
        />
      )}
      {Platform.OS === 'ios' && step && (
        <Pressable onPress={() => setStep(null)} hitSlop={8}>
          <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '700', textAlign: 'right' }}>Done</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  webWrap: { flexDirection: 'row' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
});
