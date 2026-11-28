import { Check } from 'lucide-react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { SheetScrollView } from '@/components/motion/Sheet';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { toast } from '@/components/motion/Toast';
import { LoadError } from '@/components/organize/parts';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { PillSelect, SectionLabel } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useAssignScreen } from '@/hooks/useAssignScreen';
import { invalidateCached, useCachedLoad } from '@/hooks/useCachedLoad';
import { useMyWork } from '@/hooks/useMyWork';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { share } from '@/lib/share';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import {
  archiveScreen,
  fetchOrgScreens,
  fetchOrgTournaments,
  setScreenDisplay,
  unassignScreen,
} from '@/services/organizations';

type Layout = 'tournament' | 'auto' | 'row' | 'grid';

export default function ScreenDetailScreen() {
  const { screenId, org: orgParam } = useLocalSearchParams<{ screenId: string; org?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { orgs } = useMyWork();
  const org = orgs.find((o) => o.id === orgParam) ?? orgs[0] ?? null;
  const usable = !!org && !org.suspended && !!user;
  const list = useCachedLoad(usable ? `org-screens:${user!.id}:${org!.id}` : null, () => fetchOrgScreens(org!.id));
  const tournaments = useCachedLoad(usable ? `org-tournaments:${user!.id}:${org!.id}` : null, () => fetchOrgTournaments(org!.id));
  const { assign, busy } = useAssignScreen(list.refresh);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);

  const screen = list.data?.find((s) => s.id === screenId) ?? null;
  const isAdmin = org?.role === 'admin';
  const canControl = isAdmin || !!screen?.tournament?.mine;
  const header = (
    <Stack.Screen
      options={{
        title: screen?.name ?? 'Screen',
        headerLeft: () => <HeaderBack fallback={org ? tournamentRoutes.organizeScreens(org.id) : tournamentRoutes.organize()} />,
      }}
    />
  );

  if (!screen) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, padding: Spacing.md }}>
        {header}
        {list.loading ? (
          <SkeletonList Item={TournamentCardSkeleton} count={2} />
        ) : list.error ? (
          <LoadError message={list.error} saved={false} onRetry={() => void list.refresh()} />
        ) : (
          <ThemedText muted style={{ textAlign: 'center' }}>This screen no longer exists.</ThemedText>
        )}
      </View>
    );
  }

  const url = `${screen.base_url.replace(/\/$/, '')}/s/${screen.code}`;
  const options = (tournaments.data ?? []).filter((t) => t.status === 'published' && !t.hidden);
  const courts = screen.tournament?.courts ?? [];

  const run = async (fn: () => Promise<void>, done?: string) => {
    setSaving(true);
    try {
      await fn();
      invalidateCached('org-screens:');
      await list.refresh();
      if (done) toast(done);
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleCourt = (c: string) => {
    const current = screen.courts ?? [];
    const next = current.includes(c) ? current.filter((x) => x !== c) : [...current, c];
    void run(() => setScreenDisplay(screen.id, { courts: next.length ? next : null }));
  };

  const clear = () =>
    alert('Clear this screen?', 'It shows the waiting page until a tournament is assigned.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => void run(() => unassignScreen(screen.id), 'Screen cleared') },
    ]);

  const remove = () =>
    alert('Remove this screen?', 'Its link stops working. Any TV using it needs a new link.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await archiveScreen(screen.id);
            invalidateCached('org-screens:');
            router.replace(tournamentRoutes.organizeScreens(org!.id));
          } catch (e) {
            alert('Something went wrong', friendlyTournamentError(e));
          }
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={<ThemedRefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
    >
      {header}
      {list.error && <LoadError message={list.error} saved onRetry={() => void list.refresh()} />}
      <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <ThemedText variant="caption" muted>Open this on the TV’s computer and press F11</ThemedText>
        <ThemedText selectable style={{ fontWeight: '800', fontSize: 17 }}>{url}</ThemedText>
        {screen.venue ? <ThemedText variant="caption" muted>{screen.venue}</ThemedText> : null}
        <Button label="Share link" variant="secondary" onPress={() => share({ message: `${screen.name}: ${url}`, url })} />
      </View>

      <View style={{ gap: Spacing.sm }}>
        <SectionLabel>Showing now</SectionLabel>
        {screen.tournament ? (
          <>
            <Pressable onPress={() => router.push(tournamentRoutes.tournament(screen.tournament!.id))} accessibilityRole="button">
              <ThemedText variant="heading">{screen.tournament.name}</ThemedText>
            </Pressable>
            <ThemedText variant="caption" muted>
              {screen.assigned_by ? `Set by @${screen.assigned_by}` : ''}
              {screen.assigned_at ? ` · ${new Date(screen.assigned_at).toLocaleString()}` : ''}
            </ThemedText>
            {(screen.tournament.status !== 'published' || screen.tournament.hidden || !screen.tournament.live_public) && (
              <ThemedText style={{ color: theme.warning, fontWeight: '700' }}>
                The TV shows the waiting page: this tournament isn’t publicly viewable right now.
              </ThemedText>
            )}
          </>
        ) : (
          <ThemedText muted>Nothing assigned: the TV shows the waiting page.</ThemedText>
        )}
        <Button label={screen.tournament ? 'Change' : 'Choose a tournament'} onPress={() => setPicking(true)} loading={busy === screen.id} />
        {screen.tournament && canControl && <Button label="Clear screen" variant="ghost" disabled={saving} onPress={clear} />}
      </View>

      {screen.tournament && canControl && (
        <View style={{ gap: Spacing.sm }}>
          <SectionLabel>Courts on this screen</SectionLabel>
          {courts.length === 0 ? (
            <ThemedText variant="caption" muted>No courts yet. All matches are shown.</ThemedText>
          ) : (
            <>
              <ThemedText variant="caption" muted>
                {screen.courts?.length ? 'Only the ticked courts.' : 'All courts. Tick some to show only those.'}
              </ThemedText>
              <View style={styles.wrap}>
                {Array.from(new Set([...courts, ...(screen.courts ?? [])])).map((c) => {
                  const on = !!screen.courts?.includes(c);
                  return (
                    <Pressable
                      key={c}
                      onPress={() => !saving && toggleCourt(c)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      style={[styles.chip, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accent : theme.backgroundElement }]}
                    >
                      {on && <Check size={16} color="#fff" strokeWidth={3} />}
                      <ThemedText style={{ color: on ? '#fff' : theme.text, fontWeight: '700' }}>{c}</ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          <SectionLabel>Layout</SectionLabel>
          <PillSelect<Layout>
            options={[
              { value: 'tournament', label: 'As tournament' },
              { value: 'auto', label: 'Auto' },
              { value: 'row', label: 'Side by side' },
              { value: 'grid', label: 'Grid' },
            ]}
            value={screen.layout ?? 'tournament'}
            disabled={saving}
            onChange={(v) => void run(() => setScreenDisplay(screen.id, { layout: v === 'tournament' ? null : v }))}
          />
        </View>
      )}

      {isAdmin && <Button label="Remove screen" variant="ghost" buttonStyle={{ borderColor: theme.error }} onPress={remove} />}

      <BottomSheet visible={picking} onClose={() => setPicking(false)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}>
          <ThemedText variant="heading">Show on {screen.name}</ThemedText>
          {options.length === 0 ? (
            <ThemedText muted>
              {isAdmin ? 'There is no published tournament.' : 'You have no published tournament.'}
            </ThemedText>
          ) : (
            options.map((t) => (
              <Button
                key={t.id}
                label={t.name}
                variant={t.id === screen.tournament?.id ? 'primary' : 'secondary'}
                onPress={() => {
                  setPicking(false);
                  if (t.id !== screen.tournament?.id) void assign(screen, t);
                }}
              />
            ))
          )}
        </SheetScrollView>
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.lg },
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
