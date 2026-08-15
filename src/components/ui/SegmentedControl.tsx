import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      {options.map((option) => {
        const selected = option.value === value;
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
            <Text
              style={[
                styles.label,
                compact && styles.labelCompact,
                { color: selected ? theme.background : theme.text },
              ]}>
              {option.label}
            </Text>
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
  label: {
    fontSize: 14,
    fontWeight: '700',
  },
  labelCompact: {
    fontSize: 13,
  },
});