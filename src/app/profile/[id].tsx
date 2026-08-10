import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchProfile } from '@/services/profiles';
import type { Profile } from '@/types';

export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchProfile(id)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: profile?.username ?? 'Profile',
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={12}>
              <X size={22} color={theme.text} strokeWidth={2} />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : !profile ? (
        <View style={styles.loader}>
          <ThemedText muted>User not found</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerSection}>
            <UserAvatar avatarUrl={profile.avatar_url} size={96} style={styles.avatar} />
            <ThemedText variant="hero" style={styles.username}>
              {profile.username}
            </ThemedText>
            {profile.display_name && (
              <ThemedText variant="body" muted style={styles.displayName}>
                {profile.display_name}
              </ThemedText>
            )}
            {profile.role && (
              <View style={[styles.roleBadge, { backgroundColor: '#3B82F620' }]}>
                <ThemedText variant="caption" style={{ color: '#3B82F6', fontWeight: '700' }}>
                  {profile.role === 'student' ? 'Student' : 'Teacher'}
                </ThemedText>
              </View>
            )}
          </View>

          {profile.bio && (
            <Card style={styles.bioCard}>
              <ThemedText variant="body">{profile.bio}</ThemedText>
            </Card>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: {
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  headerSection: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatar: {
    marginBottom: Spacing.xs,
  },
  username: {
    fontWeight: '800',
    textAlign: 'center',
  },
  displayName: {
    textAlign: 'center',
  },
  roleBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.sm,
  },
  bioCard: {
    width: '100%',
  },
});
