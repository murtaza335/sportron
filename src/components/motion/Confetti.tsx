import { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { Duration } from '@/lib/motion';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Fire a confetti burst from anywhere. Requires <ConfettiHost /> to be mounted. */
export function celebrate() {
  listeners.forEach((l) => l());
}

const COUNT = 24;

function Piece({ color, w, h, dx, rise, rot, delay }: { color: string; w: number; h: number; dx: number; rise: number; rot: number; delay: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withTiming(1, { duration: Duration.celebrate, easing: Easing.out(Easing.quad) })));
  }, [t, delay]);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    // upward burst then gravity pull
    const y = -rise * p + 520 * p * p;
    return {
      opacity: p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25,
      transform: [{ translateX: dx * p }, { translateY: y }, { rotate: `${rot * p}deg` }],
    };
  });
  return <Animated.View style={[{ position: 'absolute', width: w, height: h, backgroundColor: color, borderRadius: 2 }, style]} />;
}

function Burst({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [pieces] = useState(() => {
    const colors = [theme.accent, theme.accentSecondary, theme.warning];
    return Array.from({ length: COUNT }).map((_, i) => ({
      key: i,
      color: colors[i % colors.length],
      w: 6 + Math.random() * 4,
      h: 10 + Math.random() * 6,
      dx: (Math.random() - 0.5) * width * 0.9,
      rise: 180 + Math.random() * 220,
      rot: (Math.random() - 0.5) * 720,
      delay: Math.random() * 80,
    }));
  });
  useEffect(() => {
    const id = setTimeout(onDone, Duration.celebrate + 200);
    return () => clearTimeout(id);
  }, [onDone]);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', top: height * 0.45 }]}>
      {pieces.map(({ key, ...p }) => (
        <Piece key={key} {...p} />
      ))}
    </View>
  );
}

export function ConfettiHost() {
  const reduced = useReducedMotion();
  const [bursts, setBursts] = useState<number[]>([]);
  useEffect(() => {
    const l = () => {
      if (reduced) return;
      setBursts((b) => [...b, Date.now()]);
    };
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, [reduced]);
  return (
    <>
      {bursts.map((id) => (
        <Burst key={id} onDone={() => setBursts((b) => b.filter((x) => x !== id))} />
      ))}
    </>
  );
}
