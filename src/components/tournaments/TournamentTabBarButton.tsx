import { Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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
  const [press] = useState(() => new Animated.Value(1));
  const [focus] = useState(() => new Animated.Value(focused ? 1 : 0));

  useEffect(() => {
    Animated.spring(focus, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
  }, [focused, focus]);

  const shadow = theme.resolvedColorScheme === 'dark' ? Shadows.dark.elevated : Shadows.light.elevated;
  const scale = Animated.multiply(
    press,
    focus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
  );

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Pressable
        onPress={props.onPress ?? undefined}
        onLongPress={props.onLongPress ?? undefined}
        onPressIn={() => Animated.spring(press, { toValue: 0.96, useNativeDriver: true, speed: 50, bounciness: 4 }).start()}
        onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start()}
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
              transform: [{ scale }],
            },
          ]}
        >
          <Trophy size={26} color="#fff" strokeWidth={2.2} />
        </Animated.View>
      </Pressable>
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
