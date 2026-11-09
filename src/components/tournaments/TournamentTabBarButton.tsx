import { Trophy } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import { Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Springs } from '@/lib/motion';

type TabBarButtonProps = {
  onPress?: ((e: GestureResponderEvent) => void) | null;
  onLongPress?: ((e: GestureResponderEvent) => void) | null;
  accessibilityState?: { selected?: boolean } | null;
  testID?: string;
};

const SIZE = 56;
const RAISE = 20;

/** Centre tab button: a raised circular accent button (PLAN §12.1). Icon only (A5). */
export function TournamentTabBarButton(props: TabBarButtonProps) {
  const theme = useTheme();
  const focused = !!props.accessibilityState?.selected;
  const focus = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    focus.set(withSpring(focused ? 1 : 0, Springs.bouncy));
  }, [focused, focus]);

  const focusStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + focus.value * 0.06 }] }));
  const shadow = theme.resolvedColorScheme === 'dark' ? Shadows.dark.elevated : Shadows.light.elevated;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <PressableScale
        onPress={props.onPress ?? undefined}
        onLongPress={props.onLongPress ?? undefined}
        scaleTo={0.9}
        accessibilityRole="button"
        accessibilityLabel="Tournaments"
        accessibilityState={props.accessibilityState ?? undefined}
        testID={props.testID}
        hitSlop={8}
      >
        <Animated.View
          style={[
            styles.circle,
            shadow,
            {
              backgroundColor: theme.accent,
              borderColor: theme.background,
              borderWidth: focused ? 3 : 0,
            },
            focusStyle,
          ]}
        >
          <Trophy size={26} color="#fff" strokeWidth={2.2} />
        </Animated.View>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start' },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    marginTop: -RAISE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
