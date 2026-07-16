import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/ProfileForm';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { createProfile } from '@/services/profiles';

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: { displayName: string; bio: string; role: 'student' | 'teacher'; avatarUrl?: string | null }) => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    try {
      await createProfile(user.id, {
        displayName: data.displayName,
        bio: data.bio,
        role: data.role,
        avatarUrl: data.avatarUrl,
      });
      await refreshProfile();
      router.replace('/');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save profile';
      Alert.alert('Setup failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* Minimal Header */}
          <View style={styles.header}>
            <ThemedText variant="title" style={styles.title}>
              Create Profile
            </ThemedText>
            <ThemedText variant="body" muted style={styles.subtitle}>
              Set up your information to get started with matches and leaderboards.
            </ThemedText>
          </View>

          {/* Form Section */}
          <View style={styles.formContainer}>
            <ProfileForm submitLabel="Get Started" loading={loading} onSubmit={handleSubmit} />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
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