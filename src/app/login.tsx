import { FontAwesome } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Image, ImageBackground, Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import { PressableScale } from '@/components/motion/PressableScale';
import { Duration, RM, Springs, STAGGER_MS } from '@/lib/motion';
import { alert } from '@/lib/alert';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signInWithGoogle } from '@/services/auth';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      alert(
        'Setup required',
        'Add your Supabase URL and Anon Key to a .env file. See .env.example for details.'
      );
      return;
    }

    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      alert('Sign in failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('@/assets/images/login-bg.png')}
      style={styles.background}
      resizeMode="cover"
    >
      {/* Darker opacity overlay to fade background details */}
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.container}>
            
            {/* Main Branding Section */}
            <View style={styles.hero}>
              {/* Same entrance language as the splash so splash -> login feels continuous */}
              <Animated.View entering={ZoomIn.springify().damping(Springs.bouncy.damping).stiffness(Springs.bouncy.stiffness).reduceMotion(RM)}>
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={styles.appLogo}
                  resizeMode="contain"
                />
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(STAGGER_MS * 2).duration(Duration.base).reduceMotion(RM)}>
                <Text style={styles.titleText}>Sportron</Text>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(STAGGER_MS * 4).duration(Duration.base).reduceMotion(RM)}>
                <Text style={styles.subtitleText}>A community Driven Sports App</Text>
              </Animated.View>
            </View>

            {/* Action Section */}
            <Animated.View entering={FadeInDown.delay(Duration.base + 150).duration(Duration.base).reduceMotion(RM)} style={styles.actions}>
              <PressableScale
                style={styles.googleButton}
                scaleTo={0.97}
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? (
                  <Animated.View entering={FadeIn.duration(Duration.fast).reduceMotion(RM)}>
                    <ActivityIndicator color="#000" />
                  </Animated.View>
                ) : (
                  <>
                    <FontAwesome name="google" size={20} color="#EA4335" style={styles.googleIcon} />
                    <Text style={styles.buttonText}>Continue with Google</Text>
                  </>
                )}
              </PressableScale>
              
<View style={styles.linksRow}>
              <Text style={styles.footnoteText}>
                By continuing, you agree to our{' '}
              </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://murtaza335.github.io/sportron/TERMS_OF_SERVICE.html')}
              >
                <Text style={styles.linkText}>Terms of Service</Text>
              </TouchableOpacity>
              <Text style={styles.footnoteText}> and </Text>
              <TouchableOpacity
                onPress={() => Linking.openURL('https://murtaza335.github.io/sportron/PRIVACY_POLICY.html')}
              >
                <Text style={styles.linkText}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={styles.footnoteText}>.</Text>
            </View>
          </Animated.View>

          </View>
        </SafeAreaView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    // Increased opacity from 0.65 -> 0.82 to heavily fade the background image
    backgroundColor: 'rgba(5, 10, 24, 0.82)',
  },
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  appLogo: {
    width: 88,
    height: 88,
    borderRadius: 22,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: 2,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  badge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginTop: 4,
  },
  subtitleText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  actions: {
    width: '100%',
    gap: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    width: '100%',
    height: 52,
    borderRadius: 26,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
  },
  googleIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: '#1F2937',
    fontSize: 16,
    fontWeight: '600',
  },
  footnoteText: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
  },
  linkText: {
    color: 'rgba(255, 255, 255, 0.85)',
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  linksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
  },
});