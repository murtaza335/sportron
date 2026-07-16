import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Target, Trophy, Users } from 'lucide-react-native';

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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={[styles.heroIcon, { backgroundColor: theme.text, opacity: 0.1 }]}>
              <Target size={48} color={theme.text} strokeWidth={2} />
            </View>
            <ThemedText variant="title">Welcome to T3 Seecs</ThemedText>
            <ThemedText variant="body" muted style={styles.subtitle}>
              Track your matches, compete with friends, and climb the leaderboard
            </ThemedText>
          </View>

          <View style={styles.features}>
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: '#10B981', opacity: 0.15 }]}>
                <Trophy size={20} color="#10B981" strokeWidth={2} />
              </View>
              <ThemedText variant="label" style={styles.featureText}>Track Wins & Losses</ThemedText>
            </View>
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: '#3B82F6', opacity: 0.15 }]}>
                <Users size={20} color="#3B82F6" strokeWidth={2} />
              </View>
              <ThemedText variant="label" style={styles.featureText}>Play Singles & Doubles</ThemedText>
            </View>
            <View style={styles.feature}>
              <View style={[styles.featureIcon, { backgroundColor: '#8B5CF6', opacity: 0.15 }]}>
                <Target size={20} color="#8B5CF6" strokeWidth={2} />
              </View>
              <ThemedText variant="label" style={styles.featureText}>Global Leaderboards</ThemedText>
            </View>
          </View>

          <ThemedText variant="label" muted style={styles.formTitle}>
            Set up your profile
          </ThemedText>
          <ThemedText variant="caption" muted style={styles.formSubtitle}>
            This helps others recognize you in matches
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
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  heroIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 24,
  },
  features: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  feature: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  featureIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  formTitle: {
    marginTop: Spacing.md,
  },
  formSubtitle: {
    marginBottom: Spacing.lg,
  },
});