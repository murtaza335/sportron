import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { AlertTriangle, Bell, BellOff, Info } from 'lucide-react-native';

import { Card, Divider } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { removeFCMToken, softDeleteAccount, updateNotificationPreferences } from '@/services/profiles';
import { signOut } from '@/services/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import messaging from '@react-native-firebase/messaging';
import { useFCM } from '@/hooks/useFCM';

type NotificationType = 'match_pending' | 'match_approved' | 'match_rejected' | 'match_liked' | 'match_commented';

const NOTIFICATION_ITEMS: { type: NotificationType; label: string; description: string }[] = [
  { type: 'match_pending', label: 'Match Pending', description: 'When a match needs your approval' },
  { type: 'match_approved', label: 'Match Approved', description: 'When your match is verified' },
  { type: 'match_rejected', label: 'Match Rejected', description: 'When your match is disputed' },
  { type: 'match_liked', label: 'Likes', description: 'When someone likes your match' },
  { type: 'match_commented', label: 'Comments', description: 'When someone comments on your match' },
];

const DEFAULT_PREFERENCES = {
  match_pending: true,
  match_approved: true,
  match_rejected: true,
  match_liked: true,
  match_commented: true,
};

export default function SettingsScreen() {
  const theme = useTheme();
  const { profile, user } = useAuth();
  const { requestPermissions } = useFCM();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [preferences, setPreferences] = useState<Record<NotificationType, boolean>>(() => {
    if (profile?.notification_preferences) {
      return {
        match_pending: profile.notification_preferences.match_pending,
        match_approved: profile.notification_preferences.match_approved,
        match_rejected: profile.notification_preferences.match_rejected,
        match_liked: profile.notification_preferences.match_liked,
        match_commented: profile.notification_preferences.match_commented,
      };
    }
    return DEFAULT_PREFERENCES;
  });
  useEffect(() => {
    AsyncStorage.getItem('notifications-enabled').then((val) => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    });
  }, []);

  const handleMasterToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications-enabled', String(value));

    const newPrefs = value
      ? { match_pending: true, match_approved: true, match_rejected: true, match_liked: true, match_commented: true }
      : { match_pending: false, match_approved: false, match_rejected: false, match_liked: false, match_commented: false };
    setPreferences(newPrefs);

    if (profile?.id) {
      try {
        await updateNotificationPreferences(profile.id, newPrefs);
      } catch {
        setNotificationsEnabled(!value);
        setPreferences(!value
          ? { match_pending: true, match_approved: true, match_rejected: true, match_liked: true, match_commented: true }
          : { match_pending: false, match_approved: false, match_rejected: false, match_liked: false, match_commented: false });
        Alert.alert('Failed to update', 'Could not save notification preferences');
      }
    }

    if (value) {
      await requestPermissions();
    } else if (user?.id) {
      try {
        const token = await messaging().getToken();
        if (token) {
          await removeFCMToken(user.id, token);
        }
      } catch {
        // silently fail
      }
    }
  };

  const handlePreferenceToggle = async (type: NotificationType, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [type]: value }));

    if (!profile?.id) return;

    try {
      await updateNotificationPreferences(profile.id, { [type]: value });
    } catch {
      setPreferences((prev) => ({ ...prev, [type]: !value }));
      Alert.alert('Failed to update', 'Could not save notification preference');
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This will permanently erase all your data except your name on existing matches. You can sign in again to re-activate your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!profile?.id || !user?.id) return;

            try {
              const token = await messaging().getToken();
              if (token) {
                await removeFCMToken(user.id, token).catch(() => {});
              }
            } catch {}

            try {
              await softDeleteAccount(profile.id);
              await signOut();
            } catch {
              Alert.alert('Error', 'Failed to delete account. Please try again.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText variant="label" muted style={styles.sectionTitle}>
          Notifications
        </ThemedText>

        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: theme.backgroundElement }]}>
              {notificationsEnabled ? (
                <Bell size={22} color={theme.text} />
              ) : (
                <BellOff size={22} color={theme.text} />
              )}
            </View>
            <View style={styles.settingContent}>
              <ThemedText variant="body">Push Notifications</ThemedText>
              <ThemedText variant="caption" muted>
                {notificationsEnabled ? 'Enabled' : 'Disabled'}
              </ThemedText>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleMasterToggle}
              trackColor={{ false: '#9CA3AF', true: '#3B82F6' }}
              thumbColor="#F9FAFB"
            />
          </View>
        </Card>

        <Card style={styles.settingCard}>
          {NOTIFICATION_ITEMS.map((item, index) => (
            <View key={item.type}>
              {index > 0 && <Divider spacing={Spacing.xs} />}
              <View style={styles.settingRow}>
                <View style={styles.settingContent}>
                  <ThemedText variant="body">{item.label}</ThemedText>
                  <ThemedText variant="caption" muted>
                    {item.description}
                  </ThemedText>
                </View>
                <Switch
                  value={preferences[item.type]}
                  onValueChange={(val) => handlePreferenceToggle(item.type, val)}
              trackColor={{ false: '#9CA3AF', true: '#3B82F6' }}
                  thumbColor="#F9FAFB"
                  disabled={!notificationsEnabled}
                />
              </View>
            </View>
          ))}
        </Card>

        <Divider spacing={Spacing.xl} />

        <ThemedText variant="label" muted style={styles.sectionTitle}>
          About
        </ThemedText>

        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: theme.backgroundElement }]}>
              <Info size={22} color={theme.text} />
            </View>
            <View style={styles.settingContent}>
              <ThemedText variant="body">Version</ThemedText>
            </View>
            <ThemedText variant="caption" muted>
              1.0.0
            </ThemedText>
          </View>
        </Card>

        <Divider spacing={Spacing.xl} />

        <ThemedText variant="label" muted style={styles.sectionTitle}>
          Account
        </ThemedText>

        <Card style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: '#FEE2E2' }]}>
              <AlertTriangle size={22} color="#DC2626" />
            </View>
            <View style={styles.settingContent}>
              <ThemedText variant="body" style={{ color: '#DC2626' }}>Delete Account</ThemedText>
              <ThemedText variant="caption" muted>
                Permanently delete your data
              </ThemedText>
            </View>
          </View>
          <View style={styles.deleteButtonContainer}>
            <ThemedText
              variant="body"
              style={styles.deleteButton}
              onPress={handleDeleteAccount}
            >
              Delete My Account
            </ThemedText>
          </View>
        </Card>
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
    gap: Spacing.lg,
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
  deleteButtonContainer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  deleteButton: {
    color: '#DC2626',
    textAlign: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
    overflow: 'hidden',
  },
});
