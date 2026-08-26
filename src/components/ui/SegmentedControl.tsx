import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

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
  const selectedIndex = options.findIndex((o) => o.value === value);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const containerWidth = useRef(0);
  const segmentWidth = containerWidth.current / options.length || 0;

  useEffect(() => {
    if (containerWidth.current === 0) return;
    const target = (containerWidth.current / options.length) * selectedIndex;
    Animated.spring(slideAnim, {
      toValue: target,
      useNativeDriver: true,
      speed: 28,
      bounciness: 0,
    }).start();
  }, [selectedIndex, options.length, slideAnim]);

  const onContainerLayout = (e: LayoutChangeEvent) => {
    containerWidth.current = e.nativeEvent.layout.width;
    slideAnim.setValue((e.nativeEvent.layout.width / options.length) * selectedIndex);
  };

  return (
    <View
      style={[styles.container, { borderColor: theme.border }]}
      onLayout={onContainerLayout}
    >
      {/* Sliding indicator */}
      <Animated.View
        style={[
          styles.indicator,
          compact && styles.indicatorCompact,
          {
            backgroundColor: theme.text,
            width: `${100 / options.length}%`,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        const hasUnread = !!unread?.[option.value];
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              compact && styles.segmentCompact,
              pressed && { opacity: 0.6 },
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
    position: 'relative',
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: Radius.md - 1,
    zIndex: 0,
  },
  indicatorCompact: {
    borderRadius: Radius.sm,
  },
  segment: {
    flex: 1,
    minHeight: 48,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
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
