import Animated, { FadeInDown } from 'react-native-reanimated';
import { Duration, RM, STAGGER_MS } from '@/lib/motion';
import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { alert } from '@/lib/alert';
import { ProfileForm } from '@/components/ProfileForm';
import { ThemedText } from '@/components/ui/Text';
import { suggestUsername } from '@/lib/suggestUsername';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { createProfile } from '@/services/profiles';

export default function OnboardingScreen() {
  const theme = useTheme();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: { username: string; bio: string; avatarUrl?: string | null }) => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    try {
      await createProfile(user.id, {
        username: data.username,
        bio: data.bio,
        avatarUrl: data.avatarUrl ?? undefined,
      });
      // The root layout sends a freshly created account to the screen it came from (guest sign-in) or Home,
      // as soon as the profile exists. Navigating here as well would overwrite that destination.
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save profile';
      alert('Setup failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoider
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* Minimal Header */}
          <Animated.View entering={FadeInDown.duration(Duration.base).reduceMotion(RM)} style={styles.header}>
            <ThemedText variant="title" style={styles.title}>
              Almost there
            </ThemedText>
            <ThemedText variant="body" muted style={styles.subtitle}>
              Pick a username and you are in. Photo and bio are optional, and you can add them any time.
            </ThemedText>
          </Animated.View>

          {/* Form Section */}
          <Animated.View entering={FadeInDown.delay(STAGGER_MS * 2).duration(Duration.base).reduceMotion(RM)} style={styles.formContainer}>
            <ProfileForm
              submitLabel="Get Started"
              loading={loading}
              initialName={suggestUsername({ ...user?.user_metadata, email: user?.email })}
              onSubmit={handleSubmit}
            />
          </Animated.View>

        </ScrollView>
      </KeyboardAvoider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xl,
    justifyContent: 'center',
  },
  header: {
    marginBottom: Spacing.xl,
    gap: Spacing.xs,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  formContainer: {
    width: '100%',
  },
});