import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { History, Monitor, Plus, Trophy, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { LinkRow, LoadError, SuspendedBanner } from '@/components/organize/parts';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { PillSelect } from '@/components/tournaments/form';
import { StatusPill } from '@/components/tournaments/StatusPill';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedLoad } from '@/hooks/useCachedLoad';
import { useMyWork } from '@/hooks/useMyWork';
import { useTheme } from '@/hooks/use-theme';
import { formatDateRange, tournamentStatusTone } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { fetchOrgTournaments } from '@/services/organizations';

export default function OrganizeScreen() {
  const { org: orgParam } = useLocalSearchParams<{ org?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const work = useMyWork();
  const [picked, setPicked] = useState<string | null>(null);
  const org = work.orgs.find((o) => o.id === (picked ?? orgParam)) ?? work.orgs[0] ?? null;
  const list = useCachedLoad(
    org && !org.suspended && user ? `org-tournaments:${user.id}:${org.id}` : null,
    () => fetchOrgTournaments(org!.id),
  );
  const header = (
    <Stack.Screen
      options={{
        title: org ? org.short_name || org.name : 'Organize',
        headerLeft: () => <HeaderBack fallback="/tournaments" />,
      }}
    />
  );

  if (!org) {
    return (
      <View style={[styles.flex, styles.center, { backgroundColor: theme.background }]}>
        {header}
        {work.loading ? (
          <SkeletonList Item={TournamentCardSkeleton} count={2} style={{ width: '100%', padding: Spacing.md }} />
        ) : work.error ? (
          <LoadError message={work.error} saved={false} onRetry={() => void work.refresh()} />
        ) : (
          <>
            <ThemedText variant="heading">Nothing to organize</ThemedText>
            <ThemedText muted style={{ textAlign: 'center' }}>
              An organization admin adds you as an organizer.
            </ThemedText>
          </>
        )}
      </View>
    );
  }

  const isAdmin = org.role === 'admin';
  const rows = list.data ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={
        <ThemedRefreshControl
          refreshing={list.refreshing || work.refreshing}
          onRefresh={() => {
            void work.refresh();
            void list.refresh();
          }}
        />
      }
    >
      {header}
      {work.orgs.length > 1 && (
        <PillSelect<string>
          options={work.orgs.map((o) => ({ value: o.id, label: o.short_name || o.name }))}
          value={org.id}
          onChange={setPicked}
        />
      )}
      <View>
        <ThemedText variant="heading">{org.name}</ThemedText>
        <ThemedText muted>{isAdmin ? 'You are an organization admin' : 'You are an organizer'}</ThemedText>
      </View>

      {org.suspended ? (
        <SuspendedBanner />
      ) : (
        <>
          <Button
            label="Create tournament"
            icon={<Plus size={20} color={theme.background} />}
            onPress={() => router.push(tournamentRoutes.organizeNew(org.id))}
          />
          <LinkRow
            title="Screens"
            sub="What each venue TV shows"
            icon={<Monitor size={20} color={theme.text} />}
            onPress={() => router.push(tournamentRoutes.organizeScreens(org.id))}
          />
          {isAdmin && (
            <View style={{ gap: Spacing.sm }}>
              <LinkRow
                title="Organizers"
                sub="Who can create tournaments"
                icon={<UserPlus size={20} color={theme.text} />}
                onPress={() => router.push(tournamentRoutes.organizeOrganizers(org.id))}
              />
              <LinkRow
                title="Activity"
                sub="What changed, and who did it"
                icon={<History size={20} color={theme.text} />}
                onPress={() => router.push(tournamentRoutes.organizeActivity(org.id))}
              />
            </View>
          )}

          <ThemedText variant="label" muted>
            {isAdmin ? 'All tournaments' : 'My tournaments'}
          </ThemedText>
          {list.error && <LoadError message={list.error} saved={rows.length > 0} onRetry={() => void list.refresh()} />}
          {list.loading ? (
            <SkeletonList Item={TournamentCardSkeleton} count={2} />
          ) : rows.length === 0 && !list.error ? (
            <View style={styles.center}>
              <Trophy size={40} color={theme.textSecondary} strokeWidth={1.5} />
              <ThemedText style={{ fontWeight: '700' }}>Create your first tournament</ThemedText>
              <ThemedText muted style={{ textAlign: 'center' }}>
                Give it a name, pick the sports, publish. It takes about two minutes.
              </ThemedText>
            </View>
          ) : (
            <View style={{ gap: Spacing.sm }}>
              {rows.map((t) => (
                <LinkRow
                  key={t.id}
                  title={t.name}
                  sub={[
                    formatDateRange(t.starts_at, t.ends_at),
                    `${t.module_count} ${t.module_count === 1 ? 'sport' : 'sports'}`,
                    t.hidden ? 'Hidden' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={<StatusPill tone={tournamentStatusTone(t.status, 0)} />}
                  onPress={() => router.push(tournamentRoutes.tournament(t.id))}
                />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, padding: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
});
