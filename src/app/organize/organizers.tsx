import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { toast } from '@/components/motion/Toast';
import { LoadError } from '@/components/organize/parts';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { ProfilePickerSheet } from '@/components/tournaments/ProfilePickerSheet';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateCached, useCachedLoad } from '@/hooks/useCachedLoad';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { addOrganizer, fetchOrgMembers, removeOrganizer } from '@/services/organizations';
import type { OrgMember, ProfileLite } from '@/types';

export default function OrganizersScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const list = useCachedLoad(org && user ? `org-members:${user.id}:${org}` : null, () => fetchOrgMembers(org));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const members = list.data ?? [];

  const run = async (fn: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await fn();
      invalidateCached('org-');
      toast(done);
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      await list.refresh();
      setBusy(false);
    }
  };

  const add = (p: ProfileLite) => {
    setPickerOpen(false);
    void run(() => addOrganizer(org, p.id), `@${p.username} is now an organizer`);
  };

  const remove = (m: OrgMember) =>
    alert('Remove organizer?', `@${m.username} loses access immediately. Their tournaments stay.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run(() => removeOrganizer(org, m.profile_id), 'Removed') },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={<ThemedRefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
    >
      <Stack.Screen options={{ title: 'Organizers', headerLeft: () => <HeaderBack fallback={tournamentRoutes.organize(org)} /> }} />
      <ThemedText muted>
        Organizers create tournaments and run the ones they create or are added to.
      </ThemedText>
      <Button label="Add organizer" onPress={() => setPickerOpen(true)} loading={busy} />
      {list.error && <LoadError message={list.error} saved={members.length > 0} onRetry={() => void list.refresh()} />}
      {list.loading && <SkeletonList Item={TournamentCardSkeleton} count={2} />}
      {members.map((m) => (
        <View key={m.profile_id} style={styles.row}>
          <UserAvatar avatarUrl={m.avatar_url} size={40} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: '700' }}>@{m.username}</ThemedText>
            <ThemedText variant="caption" muted>
              {m.role === 'admin' ? 'Organization admin' : 'Organizer'}
            </ThemedText>
          </View>
          {m.role === 'organizer' && (
            <Pressable onPress={() => remove(m)} hitSlop={12} disabled={busy} accessibilityRole="button">
              <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '700' }}>Remove</ThemedText>
            </Pressable>
          )}
        </View>
      ))}
      <ThemedText variant="caption" muted>Organization admins are changed by the Sportron team.</ThemedText>
      <ProfilePickerSheet visible={pickerOpen} title="Add organizer" onClose={() => setPickerOpen(false)} onSelect={add} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minHeight: 48 },
});
