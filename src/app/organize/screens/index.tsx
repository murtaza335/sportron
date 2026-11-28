import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Monitor } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { SheetScrollView } from '@/components/motion/Sheet';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { LinkRow, LoadError } from '@/components/organize/parts';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { FormField, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { invalidateCached, useCachedLoad } from '@/hooks/useCachedLoad';
import { useMyWork } from '@/hooks/useMyWork';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { fetchOrgScreens, upsertScreen } from '@/services/organizations';

export default function ScreensScreen() {
  const { org: orgParam } = useLocalSearchParams<{ org?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orgs } = useMyWork();
  const org = orgs.find((o) => o.id === orgParam) ?? orgs[0] ?? null;
  const list = useCachedLoad(
    org && !org.suspended && user ? `org-screens:${user.id}:${org.id}` : null,
    () => fetchOrgScreens(org!.id),
  );
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [venue, setVenue] = useState('');
  const [busy, setBusy] = useState(false);
  const screens = list.data ?? [];
  const isAdmin = org?.role === 'admin';

  const add = async () => {
    if (!org) return;
    setBusy(true);
    try {
      const id = await upsertScreen(org.id, null, { name: name.trim(), venue: venue.trim() || null });
      invalidateCached('org-screens:');
      setAdding(false);
      setName('');
      setVenue('');
      router.push(tournamentRoutes.organizeScreen(org.id, id));
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={<ThemedRefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
    >
      <Stack.Screen options={{ title: 'Screens', headerLeft: () => <HeaderBack fallback={tournamentRoutes.organize(org?.id)} /> }} />
      <ThemedText muted>
        Each screen has one permanent link. Open it on the venue TV once; after that, change what it shows from here.
      </ThemedText>
      {isAdmin && <Button label="Add screen" onPress={() => setAdding(true)} />}
      {list.error && <LoadError message={list.error} saved={screens.length > 0} onRetry={() => void list.refresh()} />}
      {list.loading && <SkeletonList Item={TournamentCardSkeleton} count={2} />}
      {!list.loading && !list.error && screens.length === 0 && (
        <View style={styles.empty}>
          <Monitor size={40} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText style={{ fontWeight: '700' }}>{isAdmin ? 'Add your first screen' : 'No screens yet'}</ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            {isAdmin ? 'For example “Old Gym TV”.' : 'An organization admin adds them.'}
          </ThemedText>
        </View>
      )}
      {org &&
        screens.map((s) => (
          <LinkRow
            key={s.id}
            icon={<Monitor size={20} color={theme.text} />}
            title={s.name}
            sub={[s.venue, s.tournament ? `Showing ${s.tournament.name}` : 'Waiting page'].filter(Boolean).join(' · ')}
            onPress={() => router.push(tournamentRoutes.organizeScreen(org.id, s.id))}
          />
        ))}

      <BottomSheet visible={adding} onClose={() => setAdding(false)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.md, paddingBottom: Spacing.lg }} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Add screen</ThemedText>
          <FormField label="Name">
            <TextField value={name} onChangeText={setName} maxLength={40} placeholder="Old Gym TV" />
          </FormField>
          <FormField label="Venue (optional)">
            <TextField value={venue} onChangeText={setVenue} maxLength={120} placeholder="Old Gym" />
          </FormField>
          <Button label="Add screen" loading={busy} disabled={name.trim().length < 2} onPress={() => void add()} />
        </SheetScrollView>
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xl },
});
