import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/contexts/ThemeContext';
import { Duration, Easings, Springs } from '@/lib/motion';

const APP_NAME = 'Sportron';
const LETTER_STAGGER = 70;
const LOGO_MS = 350;
const LETTER_MS = 320;
const UNDERLINE_MS = 350;
const HOLD_MS = 500;
const LETTERS_START = LOGO_MS;
const UNDERLINE_START = LETTERS_START + (APP_NAME.length - 1) * LETTER_STAGGER + LETTER_MS;
const INTRO_TOTAL = UNDERLINE_START + UNDERLINE_MS + HOLD_MS;

function Letter({ char, index, reduced, color }: { char: string; index: number; reduced: boolean; color: string }) {
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    p.set(withDelay(LETTERS_START + index * LETTER_STAGGER, withTiming(1, { duration: LETTER_MS, easing: Easing.out(Easing.back(1.8)) })));
  }, [p, index, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value),
    transform: [{ translateY: (1 - p.value) * 18 }],
  }));
  return <Animated.Text style={[styles.letter, { color }, style]}>{char}</Animated.Text>;
}

/**
 * Animated splash. Rendered as an overlay above the app. It plays its intro, then — once `ready`
 * (fonts + auth resolved) — scales the logo up and fades out, calling `onComplete` when gone.
 */
export function SplashScreen({ ready, onComplete }: { ready: boolean; onComplete: () => void }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [introDone, setIntroDone] = useState(false);

  const logo = useSharedValue(reduced ? 1 : 0);
  const logoScale = useSharedValue(reduced ? 1 : 0.6);
  const underline = useSharedValue(reduced ? 1 : 0);
  const exit = useSharedValue(1);
  const exitScale = useSharedValue(1);

  useEffect(() => {
    if (reduced) {
      const id = setTimeout(() => setIntroDone(true), 300);
      return () => clearTimeout(id);
    }
    logo.set(withTiming(1, { duration: LOGO_MS, easing: Easings.standard }));
    logoScale.set(withSpring(1, Springs.bouncy));
    underline.set(withDelay(UNDERLINE_START, withTiming(1, { duration: UNDERLINE_MS, easing: Easings.standard })));
    const id = setTimeout(() => setIntroDone(true), INTRO_TOTAL);
    return () => clearTimeout(id);
  }, [reduced, logo, logoScale, underline]);

  useEffect(() => {
    if (!(introDone && ready)) return;
    exit.set(withTiming(0, { duration: Duration.base, easing: Easings.standard }));
    if (!reduced) exitScale.set(withTiming(1.08, { duration: Duration.base, easing: Easings.standard }));
    const id = setTimeout(onComplete, Duration.base + 20);
    return () => clearTimeout(id);
  }, [introDone, ready, reduced, exit, exitScale, onComplete]);

  const rootStyle = useAnimatedStyle(() => ({ opacity: exit.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ scale: logoScale.value * exitScale.value }],
  }));
  const underlineStyle = useAnimatedStyle(() => ({
    opacity: underline.value,
    transform: [{ scaleX: underline.value }],
  }));

  return (
    <Animated.View
      pointerEvents={introDone && ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: theme.background }, rootStyle]}>
      <Animated.Image
        source={require('@/assets/images/icon-512.png')}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
      <View style={styles.nameRow}>
        {APP_NAME.split('').map((char, i) => (
          <Letter key={i} char={char} index={i} reduced={reduced} color={theme.text} />
        ))}
      </View>
      <Animated.View style={[styles.underline, { backgroundColor: theme.tabBarActive ?? theme.text }, underlineStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  logo: {
    width: 110,
    height: 110,
    marginBottom: 20,
  },
  nameRow: {
    flexDirection: 'row',
  },
  letter: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
  },
  underline: {
    marginTop: 10,
    width: 80,
    height: 3,
    borderRadius: 2,
  },
});
