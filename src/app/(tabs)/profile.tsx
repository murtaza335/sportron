import { useEffect, useMemo, useState } from 'react';
import { Alert, Animated, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Bell, Cog, Pencil, Sun, Moon, Palette, X, Check } from 'lucide-react-native';

import { ProfileForm } from '@/components/ProfileForm';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { useAuth } from '@/contexts/AuthContext';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { signOut } from '@/services/auth';
import { updateProfile, removeFCMToken } from '@/services/profiles';
import { useTheme } from '@/hooks/use-theme';
import { useFCM } from '@/hooks/useFCM';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';

export default function ProfileScreen() {
  const theme = useTheme();
  const { colorScheme, setTheme } = useTheme();
  const { profile, refreshProfile, user } = useAuth();
  const { requestPermissions } = useFCM();
  const [editing, setEditing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const slideAnim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (showThemeModal) {
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }
    }, [showThemeModal, slideAnim]);

  useEffect(() => {
    AsyncStorage.getItem('notifications-enabled').then((val) => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    });
  }, []);

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications-enabled', String(value));
    if (value) {
      await requestPermissions();
    } else if (user?.id) {
      try {
        const token = await messaging().getToken();
        if (token) {
          await removeFCMToken(user.id, token);
        }
      } catch {
        // silently fail — token might not exist yet
      }
    }
  };

  const handleSave = async (data: { displayName: string; bio: string; role: 'student' | 'teacher'; avatarUrl?: string | null }) => {
    if (!profile?.id) {
      return;
    }

    try {
      await updateProfile(profile.id, {
        displayName: data.displayName,
        bio: data.bio,
        role: data.role,
        avatarUrl: data.avatarUrl ?? undefined,
      });
      await refreshProfile();
      setEditing(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update profile';
      Alert.alert('Update failed', message);
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
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {!editing ? (
          <View style={styles.summary}>
            <View style={styles.avatarContainer}>
              {profile?.avatar_url ? (
                <View style={[styles.avatar, { backgroundColor: theme.text }]}>
                  <Image
                    source={{ uri: profile.avatar_url }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View style={[styles.avatar, { backgroundColor: theme.text }]}>
                  <ThemedText variant="hero" style={{ color: theme.background }}>
                    {profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
                  </ThemedText>
                </View>
              )}
              <Pressable
                onPress={() => setEditing(true)}
                style={[styles.editAvatarButton, { backgroundColor: theme.text }]}
                hitSlop={8}
              >
                <Pencil size={14} color={theme.background} />
              </Pressable>
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
          </View>
        ) : (
          <ProfileForm
            initialName={profile?.display_name}
            initialBio={profile?.bio ?? ''}
            initialRole={profile?.role}
            initialAvatar={profile?.avatar_url ?? null}
            submitLabel="Save changes"
            onSubmit={handleSave}
          />
        )}

        <Divider spacing={Spacing.md} />

        <View style={styles.sectionHeader}>
          <ThemedText variant="label" muted style={styles.sectionTitle}>
            Appearance
          </ThemedText>
          <Pressable
            onPress={() => setShowThemeModal(true)}
            style={[styles.sectionIcon, { backgroundColor: theme.backgroundElement }]}
            hitSlop={12}
          >
            {colorScheme === 'dark' ? (
              <Moon size={16} color={theme.text} />
            ) : colorScheme === 'light' ? (
              <Sun size={16} color={theme.text} />
            ) : (
              <Palette size={16} color={theme.text} />
            )}
          </Pressable>
        </View>

        {/* Theme Modal - Slide from Bottom */}
        {showThemeModal && (
          <Modal
            animationType="none"
            transparent
            visible={showThemeModal}
            onRequestClose={() => setShowThemeModal(false)}
          >
            <View style={styles.modalBackdrop}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowThemeModal(false)} />
              <Animated.View
                style={[
                  styles.modalCard,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                    transform: [
                      {
                        translateY: slideAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [400, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <View style={styles.modalHeader}>
                  <ThemedText variant="label">Choose Theme</ThemedText>
                  <Pressable onPress={() => setShowThemeModal(false)} hitSlop={12}>
                    <X size={20} color={theme.text} />
                  </Pressable>
                </View>
                <View style={styles.modalOptions}>
                  {(['light', 'dark', 'system'] as const).map((option) => (
                    <Pressable
                      key={option}
                      onPress={() => { setTheme(option); setShowThemeModal(false); }}
                      style={({ pressed }) => [
                        styles.modalOption,
                        { backgroundColor: theme.background },
                        pressed && { backgroundColor: theme.backgroundElement },
                        colorScheme === option && { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <View style={styles.modalOptionContent}>
                        {option === 'light' && <Sun size={22} color={theme.text} />}
                        {option === 'dark' && <Moon size={22} color={theme.text} />}
                        {option === 'system' && <Palette size={22} color={theme.text} />}
                        <ThemedText variant="body" style={{ marginLeft: Spacing.md, fontWeight: colorScheme === option ? '700' : '500' }}>
                          {option === 'light' ? 'Light' : option === 'dark' ? 'Dark' : 'System'}
                        </ThemedText>
                      </View>
                      {colorScheme === option && <Check size={22} color="#10B981" />}
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            </View>
          </Modal>
        )}

        <Divider spacing={Spacing.md} />

        <ThemedText variant="label" muted style={styles.sectionTitle}>
          Notifications
        </ThemedText>

        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: theme.backgroundElement }]}>
              <Bell size={22} color={theme.text} />
            </View>
            <View style={styles.settingContent}>
              <ThemedText variant="body">Push Notifications</ThemedText>
              <ThemedText variant="caption" muted>
                {notificationsEnabled ? 'Enabled' : 'Disabled'}
              </ThemedText>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: theme.border, true: theme.text }}
              thumbColor={theme.background}
            />
          </View>
        </Card>

        <Button
          label="Advanced Settings"
          variant="ghost"
          icon={<Cog size={18} color={theme.text} />}
          onPress={() => router.navigate('/settings')}
        />

        <Divider spacing={Spacing.md} />

        <View style={{ height: 80 }} />

        <Button
          label="Sign out"
          variant="ghost"
          loading={signingOut}
          onPress={handleSignOut}
          buttonStyle={{
            borderColor: '#DC2626',
            backgroundColor: 'rgba(220, 38, 38, 0.08)',
          }}
        />
      </ScrollView>
    </View>
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
    gap: Spacing.md,
  },
  summary: {
    gap: Spacing.md,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  avatarContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 44,
  },
  editAvatarButton: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
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
    marginLeft: Spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
    paddingRight: Spacing.sm,
  },
  sectionIcon: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCard: {
    paddingVertical: 0,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
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
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalCard: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg + 10,
    paddingTop: Spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  modalOptions: {
    gap: Spacing.sm,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  modalOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
