import { Bell, Check, Cog, Download, Globe, Moon, Palette, Pencil, Sun, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileForm } from '@/components/ProfileForm';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { Card, Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useFCM } from '@/hooks/useFCM';
import { signOut } from '@/services/auth';
import { removeFCMToken, updateNotificationPreferences, updateProfile } from '@/services/profiles';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { router } from 'expo-router';

export default function ProfileScreen() {
  const theme = useTheme();
  const { colorScheme, setTheme } = useTheme();
  const { profile, refreshProfile, user } = useAuth();
  const insets = useSafeAreaInsets();
  const { requestPermissions } = useFCM();
  const [editing, setEditing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [dismissedWebPrompt, setDismissedWebPrompt] = useState(false);
  const slideAnim = useMemo(() => new Animated.Value(0), []);

  // Detect web platform and OS
  const isWeb = Platform.OS === 'web';
  const isIOSWeb = isWeb && typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroidWeb = isWeb && typeof navigator !== 'undefined' && /Android/.test(navigator.userAgent);
  const showWebPrompt = isWeb && (isIOSWeb || isAndroidWeb) && !dismissedWebPrompt;

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

    if (profile?.id) {
      try {
        const newPrefs = value
          ? { ...DEFAULT_NOTIFICATION_PREFERENCES }
          : Object.fromEntries(
              Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).map((k) => [k, false]),
            ) as Record<string, boolean>;
        await updateNotificationPreferences(profile.id, newPrefs);
      } catch {
        // silently fail — preferences sync is best-effort
      }
    }

    if (value) {
      await requestPermissions();
    } else if (user?.id && Platform.OS !== 'web') {
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

  const handleSave = async (data: { username: string; bio: string; avatarUrl?: string | null }) => {
    if (!profile?.id) {
      return;
    }

    setEditing(false);

    try {
      await updateProfile(profile.id, {
        username: data.username,
        bio: data.bio,
        avatarUrl: data.avatarUrl ?? undefined,
      });
      await refreshProfile();
    } catch (error) {
      setEditing(true);
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
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Spacing.xxl + Math.max(insets.bottom, 56) }]}>
        {showWebPrompt && (
          <View style={[styles.webPrompt, { backgroundColor: isIOSWeb ? theme.text : '#3B82F6' }]}>
            <View style={styles.webPromptContent}>
              {isIOSWeb ? (
                <>
                  <Globe size={24} color={theme.background} />
                  <View style={styles.webPromptText}>
                    <ThemedText variant="body" style={{ color: theme.background, fontWeight: '600' }}>
                      Add to Home Screen for the best experience
                    </ThemedText>
                    <ThemedText variant="caption" style={{ color: theme.background, opacity: 0.9 }}>
                      Tap the share button and select &ldquo;Add to Home Screen&rdquo; to install Sportron like an app. Then enable notifications in Settings to never miss a match or ping.
                    </ThemedText>
                  </View>
                </>
              ) : (
                <>
                  <Download size={24} color={theme.background} />
                  <View style={styles.webPromptText}>
                    <ThemedText variant="body" style={{ color: theme.background, fontWeight: '600' }}>
                      Download the app for the full experience
                    </ThemedText>
                    <ThemedText variant="caption" style={{ color: theme.background, opacity: 0.9 }}>
                      Get push notifications, offline access, and native performance with our mobile app.
                    </ThemedText>
                    <Pressable
                      onPress={() => { if (typeof window !== 'undefined') window.location.href = '/android'; }}
                      style={styles.webPromptLink}
                      hitSlop={8}
                    >
                      <ThemedText variant="caption" style={{ color: theme.background, textDecorationLine: 'underline' }}>
                        Get it on Google Play
                      </ThemedText>
                    </Pressable>
                  </View>
                </>
              )}
              <Pressable
                onPress={() => setDismissedWebPrompt(true)}
                style={styles.webPromptDismiss}
                hitSlop={8}
              >
                <X size={18} color={theme.background} />
              </Pressable>
            </View>
          </View>
        )}
        {!editing ? (
          <View style={styles.summary}>
            <View style={styles.avatarContainer}>
              <UserAvatar avatarUrl={profile?.avatar_url} size={88} />
              <Pressable
                onPress={() => setEditing(true)}
                style={[styles.editAvatarButton, { backgroundColor: theme.text }]}
                hitSlop={8}
              >
                <Pencil size={14} color={theme.background} />
              </Pressable>
            </View>
            <ThemedText variant="heading" style={styles.name}>{profile?.username}</ThemedText>
            {profile?.bio ? (
              <ThemedText variant="body" muted style={styles.bio}>
                {profile.bio}
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <ProfileForm
            initialName={profile?.username}
            initialBio={profile?.bio ?? ''}
            initialAvatar={profile?.avatar_url ?? null}
            submitLabel="Save changes"
            excludeUsername={profile?.username}
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
                  {(['light', 'dark'] as const).map((option) => (
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
                        <ThemedText variant="body" style={{ marginLeft: Spacing.md, fontWeight: colorScheme === option ? '700' : '500' }}>
                          {option === 'light' ? 'Light' : 'Dark'}
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
              trackColor={{ false: '#9CA3AF', true: '#3B82F6' }}
              thumbColor="#F9FAFB"
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
  webPrompt: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  webPromptContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  webPromptText: {
    flex: 1,
    gap: Spacing.xs,
  },
  webPromptDismiss: {
    marginTop: 2,
    padding: Spacing.xs,
  },
  webPromptLink: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.xs,
  },
});
