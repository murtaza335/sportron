import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  /** Shows a green "unread" dot next to the label for the given segment values. */
  unread?: Partial<Record<T, boolean>>;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  unread,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
        const hasUnread = !!unread?.[option.value];
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              compact && styles.segmentCompact,
              selected && { backgroundColor: theme.text },
            ]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <View style={styles.segmentContent}>
              <Text
                style={[
                  styles.label,
                  compact && styles.labelCompact,
                  { color: selected ? theme.background : theme.text },
                ]}>
                {option.label}
              </Text>
              {hasUnread && <View style={[styles.dot, { backgroundColor: theme.success }]} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: 48,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentCompact: {
    minHeight: 32,
    paddingVertical: 4,
    paddingHorizontal: Spacing.md,
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  labelCompact: {
    fontSize: 13,
  },
});