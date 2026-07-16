import { useState } from 'react';
import { Alert, ImageBackground, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Target, Trophy, Users, Globe } from 'lucide-react-native';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signInWithGoogle } from '@/services/auth';

export default function LoginScreen() {
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Setup required',
        'Add your Supabase URL and Anon Key to a .env file. See .env.example for details.',
      );
      return;
    }

    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Sign in failed';
      Alert.alert('Sign in failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ImageBackground
      source={require('@/assets/images/login-bg.png')}
      style={styles.background}
      resizeMode="cover">
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.container}>
            <View style={styles.hero}>
              <View style={[styles.heroIcon, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)', borderWidth: 1 }]}>
                <Target size={48} color="#FFFFFF" strokeWidth={2.5} />
              </View>
              <ThemedText variant="hero" style={styles.titleText}>T3 Seecs</ThemedText>
              <ThemedText variant="heading" style={[styles.subtitle, styles.lightText]}>
                Table Tennis{'\n'}Tracker
              </ThemedText>
              <ThemedText variant="body" style={styles.descriptionText} numberOfLines={2}>
                Log matches, track wins, and follow the global feed
              </ThemedText>
            </View>

            <View style={styles.features}>
              <View style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Trophy size={20} color="#FFFFFF" strokeWidth={2} />
                </View>
                <ThemedText variant="caption" style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>
                  Track Wins
                </ThemedText>
              </View>
              <View style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Users size={20} color="#FFFFFF" strokeWidth={2} />
                </View>
                <ThemedText variant="caption" style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>
                  Singles & Doubles
                </ThemedText>
              </View>
              <View style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Globe size={20} color="#FFFFFF" strokeWidth={2} />
                </View>
                <ThemedText variant="caption" style={{ color: 'rgba(255,255,255,0.9)', fontWeight: '600' }}>
                  Global Feed
                </ThemedText>
              </View>
            </View>

            <View style={styles.actions}>
              <Button
                label="Continue With Google"
                loading={loading}
                onPress={handleGoogleSignIn}
                icon={
                  <View style={styles.googleIcon}>
                    <View style={styles.googleLogo}>
                      <View style={styles.googleColor1} />
                      <View style={styles.googleColor2} />
                      <View style={styles.googleColor3} />
                      <View style={styles.googleColor4} />
                    </View>
                  </View>
                }
              />
              <ThemedText variant="caption" style={styles.footnoteText}>
                One tap. Stay signed in securely.
              </ThemedText>
            </View>
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
    backgroundColor: 'rgba(5, 10, 25, 0.55)',
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
    justifyContent: 'space-between',
    paddingBottom: Spacing.xxl,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: Spacing.xl,
  },
  heroIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: '#FFFFFF',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 32,
  },
  lightText: {
    color: '#FFFFFF',
  },
  descriptionText: {
    marginTop: Spacing.sm,
    maxWidth: 280,
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  featureIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    gap: Spacing.md,
    alignItems: 'center',
  },
  googleIcon: {
    marginRight: Spacing.sm,
  },
  googleLogo: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    transform: [{ rotate: '45deg' }],
  },
  googleColor1: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: '50%',
    backgroundColor: '#4285F4',
  },
  googleColor2: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: '50%',
    bottom: 0,
    backgroundColor: '#34A853',
    transform: [{ rotate: '90deg' }],
  },
  googleColor3: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    right: 0,
    bottom: 0,
    backgroundColor: '#FBBC05',
  },
  googleColor4: {
    position: 'absolute',
    top: 0,
    left: '50%',
    right: 0,
    bottom: '50%',
    backgroundColor: '#EA4335',
  },
  footnoteText: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.7)',
  },
});