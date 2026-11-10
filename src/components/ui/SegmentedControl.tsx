import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

type SegmentedControlProps<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  compact?: boolean;
  /** Shows a green "unread" dot next to the label for the given segment values. */
  unread?: Partial<Record<T, boolean>>;
};

function SegmentLabel({
  index,
  position,
  compact,
  from,
  to,
  children,
}: {
  index: number;
  position: SharedValue<number>;
  compact: boolean;
  from: string;
  to: string;
  children: string;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(position.value - index));
    return { color: interpolateColor(t, [0, 1], [from, to]) };
  });
  return (
    <Animated.Text
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.7}
      style={[styles.label, compact && styles.labelCompact, style]}>
      {children}
    </Animated.Text>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  compact = false,
  unread,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const [width, setWidth] = useState(0);
  const position = useSharedValue(selectedIndex);

  useEffect(() => {
    position.set(
      reduced ? withTiming(selectedIndex, { duration: Duration.fast }) : withSpring(selectedIndex, Springs.snappy),
    );
  }, [selectedIndex, reduced, position]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (width / options.length) * position.value }],
  }));

  const onContainerLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View style={[styles.container, { borderColor: theme.border }]} onLayout={onContainerLayout}>
      <Animated.View
        style={[
          styles.indicator,
          compact && styles.indicatorCompact,
          { backgroundColor: theme.text, width: `${100 / options.length}%` },
          indicatorStyle,
        ]}
      />
      {options.map((option, i) => {
        const selected = option.value === value;
        const hasUnread = !!unread?.[option.value];
        return (
          <Pressable
            key={option.value}
            onPress={() => {
              if (!selected) haptics.selection();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              compact && styles.segmentCompact,
              pressed && { opacity: 0.6 },
            ]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityState={{ selected }}>
            <View style={styles.segmentContent}>
              <SegmentLabel index={i} position={position} compact={compact} from={theme.text} to={theme.background}>
                {option.label}
              </SegmentLabel>
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
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  segmentCompact: {
    minHeight: 32,
    paddingVertical: 4,
    paddingHorizontal: Spacing.xs,
  },
  segmentContent: {
    maxWidth: '100%',
    flexShrink: 1,
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
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  labelCompact: {
    fontSize: 13,
  },
});
