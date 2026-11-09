import { createContext, useContext, type ReactNode } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PulseContext = createContext<SharedValue<number> | null>(null);

/** One shared pulse loop for every skeleton underneath (no per-item loops). */
export function SkeletonProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    pulse.set(withRepeat(withTiming(0.5, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [pulse, reduced]);
  return <PulseContext.Provider value={pulse}>{children}</PulseContext.Provider>;
}

function useSkeletonStyle() {
  const shared = useContext(PulseContext);
  const fallback = useSharedValue(1);
  const pulse = shared ?? fallback;
  return useAnimatedStyle(() => ({ opacity: pulse.value }));
}

type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = '100%', height = 14, radius = Radius.sm, style }: SkeletonProps) {
  const theme = useTheme();
  const animated = useSkeletonStyle();
  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: theme.backgroundSelected }, animated, style]}
    />
  );
}

export function SkeletonCircle({ size = 40, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <Skeleton width={size} height={size} radius={size / 2} style={style} />;
}

export function SkeletonText({ lines = 2, gap = 8, height = 12 }: { lines?: number; gap?: number; height?: number }) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={height} width={i === lines - 1 && lines > 1 ? '60%' : '100%'} />
      ))}
    </View>
  );
}
