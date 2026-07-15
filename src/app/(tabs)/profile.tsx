import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/ProfileForm';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { useAuth } from '@/contexts/AuthContext';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { signOut } from '@/services/auth';
import { updateProfile } from '@/services/profiles';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { profile, refreshProfile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSave = async (data: { displayName: string; bio: string; role: 'student' | 'teacher' }) => {
    if (!profile?.id) {
      return;
    }

    setSaving(true);
    try {
      await updateProfile(profile.id, {
        displayName: data.displayName,
        bio: data.bio,
        role: data.role,
      });
      await refreshProfile();
      setEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update profile';
      Alert.alert('Update failed', message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign out';
      Alert.alert('Sign out failed', message);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText variant="title">Profile</ThemedText>

        {!editing ? (
          <View style={styles.summary}>
            <ThemedText variant="heading">{profile?.display_name}</ThemedText>
            <ThemedText variant="caption" muted style={styles.role}>
              {profile?.role}
            </ThemedText>
            {profile?.bio ? (
              <ThemedText variant="body" muted style={styles.bio}>
                {profile.bio}
              </ThemedText>
            ) : null}

            <Button label="Edit profile" variant="secondary" onPress={() => setEditing(true)} />
          </View>
        ) : (
          <ProfileForm
            initialName={profile?.display_name}
            initialBio={profile?.bio ?? ''}
            initialRole={profile?.role}
            submitLabel="Save changes"
            loading={saving}
            onSubmit={handleSave}
          />
        )}

        <Divider spacing={Spacing.xl} />

        <Button
          label="Sign out"
          variant="ghost"
          loading={signingOut}
          onPress={handleSignOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  summary: {
    gap: Spacing.sm,
  },
  role: {
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  bio: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
});
