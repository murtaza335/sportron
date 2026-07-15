import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/ProfileForm';
import { ThemedText } from '@/components/ui/Text';
import { useAuth } from '@/contexts/AuthContext';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { createProfile } from '@/services/profiles';
import { useTheme } from '@/hooks/use-theme';

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (data: { displayName: string; bio: string; role: 'student' | 'teacher' }) => {
    if (!user?.id) {
      return;
    }

    setLoading(true);
    try {
      await createProfile(user.id, {
        displayName: data.displayName,
        bio: data.bio,
        role: data.role,
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
          keyboardShouldPersistTaps="handled">
          <ThemedText variant="title">Set up profile</ThemedText>
          <ThemedText variant="body" muted style={styles.subtitle}>
            Tell us a bit about yourself before your first match.
          </ThemedText>

          <ProfileForm submitLabel="Get started" loading={loading} onSubmit={handleSubmit} />
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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  subtitle: {
    marginBottom: Spacing.sm,
  },
});
