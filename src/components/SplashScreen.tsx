import { useTheme } from '@/contexts/ThemeContext';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

const APP_NAME = 'Sportron';
const LETTER_STAGGER = 70;
const HOLD_MS = 500;

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const theme = useTheme();
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const letters = useMemo(
    () => APP_NAME.split('').map(() => new Animated.Value(0)),
    []
  );
  const underline = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(logoScale, {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(
        LETTER_STAGGER,
        letters.map((v) =>
          Animated.timing(v, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.back(1.8)),
            useNativeDriver: true,
          })
        )
      ),
      Animated.timing(underline, {
        toValue: 1,
        duration: 350,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(HOLD_MS),
    ]);

    animation.start(({ finished }) => {
      if (finished) onCompleteRef.current();
    });

    return () => animation.stop();
  }, [letters, logoOpacity, logoScale, underline]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Animated.Image
        source={require('@/assets/images/icon-512.png')}
        style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        resizeMode="contain"
      />
      <View style={styles.nameRow}>
        {APP_NAME.split('').map((char, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.letter,
              {
                color: theme.text,
                opacity: letters[i],
                transform: [
                  {
                    translateY: letters[i].interpolate({
                      inputRange: [0, 1],
                      outputRange: [18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {char}
          </Animated.Text>
        ))}
      </View>
      <Animated.View
        style={[
          styles.underline,
          {
            backgroundColor: theme.tabBarActive ?? theme.text,
            opacity: underline,
            transform: [{ scaleX: underline }],
          },
        ]}
      />
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
