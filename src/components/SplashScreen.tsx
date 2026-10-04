import { useTheme } from '@/contexts/ThemeContext';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

/* eslint-disable react-hooks/refs */

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const logoOpacity = useRef(new Animated.Value(0));
  const logoTranslateY = useRef(new Animated.Value(30));
  const textOpacity = useRef(new Animated.Value(0));
  const textTranslateY = useRef(new Animated.Value(20));

  useEffect(() => {
    const animation = async () => {
      await Animated.sequence([
        Animated.parallel([
          Animated.timing(logoOpacity.current, {
            toValue: 1,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(logoTranslateY.current, {
            toValue: 0,
            duration: 500,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
        Animated.delay(100),
        Animated.parallel([
          Animated.timing(textOpacity.current, {
            toValue: 1,
            duration: 350,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(textTranslateY.current, {
            toValue: 0,
            duration: 400,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      setTimeout(onComplete, 400);
    };

    animation();
  }, [onComplete]);

  const logoStyle = { opacity: logoOpacity.current, transform: [{ translateY: logoTranslateY.current }] };
  const textStyle = { opacity: textOpacity.current, transform: [{ translateY: textTranslateY.current }] };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.Image
        source={require('@/assets/images/icon-512.png')}
        style={[styles.logo, logoStyle]}
        resizeMode="contain"
      />
      <Animated.Text style={[styles.text, textStyle]}>SPORTRON</Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 100,
    height: 100,
    marginBottom: 16,
  },
  text: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
});