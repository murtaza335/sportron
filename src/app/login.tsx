import { useState } from 'react';
import { Alert, ImageBackground, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured } from '@/lib/supabase';
import { signInWithGoogle } from '@/services/auth';

export default function LoginScreen() {
  const theme = useTheme();
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
    // 1. The image background now sits as the true root container
    <ImageBackground
      source={require('@/assets/images/login-bg.png')}
      style={styles.background}
      resizeMode="cover"
    >
      {/* 2. A semi-transparent dark mask overlay helps protect text readability over the graphic */}
      <View style={styles.overlay}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.container}>
            <View style={styles.hero}>
              <ThemedText variant="hero" style={styles.titleText}>T3 Seecs</ThemedText>
              <ThemedText variant="heading" style={[styles.subtitle, styles.lightText]}>
                Table Tennis{'\n'}Tracker Seecs
              </ThemedText>
              {/* <ThemedText variant="body" style={styles.descriptionText}>
                Log matches, track wins, and follow the global feed.
              </ThemedText> */}
            </View>
                
            <View style={styles.actions}>
              <Button
                label="Continue With Google"
                loading={loading}
                onPress={handleGoogleSignIn}
              />
              {/* <ThemedText variant="caption" style={styles.footnoteText}>
                One tap. Stay signed in.
              </ThemedText> */}
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
    backgroundColor: 'rgba(5, 10, 25, 0.45)', // Custom dimming tint layer over the background graphic
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
    gap: Spacing.md,
  },
  subtitle: {
    marginTop: Spacing.sm,
  },
  // Overrides to force crisp contrast over the visual graphic backdrop
  titleText: {
    color: '#FFFFFF',
  },
  lightText: {
    color: '#FFFFFF',
  },
  descriptionText: {
    marginTop: Spacing.sm,
    maxWidth: 280,
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 15,
  },
  actions: {
    gap: Spacing.md,
  },
  footnoteText: {
    textAlign: 'center',
    color: 'rgba(255, 255, 255, 0.6)',
  },
});