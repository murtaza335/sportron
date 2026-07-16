import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sun, Moon, Palette } from 'lucide-react-native';

import { ProfileForm } from '@/components/ProfileForm';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { useAuth } from '@/contexts/AuthContext';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { signOut } from '@/services/auth';
import { updateProfile } from '@/services/profiles';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileScreen() {
  const theme = useTheme();
  const { colorScheme, toggleTheme } = useTheme();
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
            <View style={[styles.avatar, { backgroundColor: theme.text }]}>
              <ThemedText variant="hero" style={{ color: theme.background }}>
                {profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
              </ThemedText>
            </View>
            <ThemedText variant="heading" style={styles.name}>{profile?.display_name}</ThemedText>
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

        <ThemedText variant="label" muted style={styles.sectionTitle}>
          Appearance
        </ThemedText>

        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: theme.backgroundElement }]} >
              <Palette size={22} color={theme.text} />
            </View>
            <View style={styles.settingContent}>
              <ThemedText variant="body">Theme</ThemedText>
              <ThemedText variant="caption" muted>
                {colorScheme === 'dark' ? 'Dark mode' : colorScheme === 'light' ? 'Light mode' : 'System default'}
              </ThemedText>
            </View>
            <Pressable
              onPress={toggleTheme}
              style={[styles.toggleButton, { backgroundColor: theme.backgroundElement }]}
              hitSlop={12}
            >
              {colorScheme === 'dark' ? (
                <Moon size={22} color={theme.text} />
              ) : colorScheme === 'light' ? (
                <Sun size={22} color={theme.text} />
              ) : (
                <Palette size={22} color={theme.text} />
              )}
            </Pressable>
          </View>
        </Card>

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
    gap: Spacing.md,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    textAlign: 'center',
  },
  role: {
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  bio: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    maxWidth: '90%',
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  settingCard: {
    paddingVertical: Spacing.xs,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  settingContent: {
    flex: 1,
    gap: 2,
  },
  toggleButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
