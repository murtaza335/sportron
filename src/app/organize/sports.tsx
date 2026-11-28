import { Stack, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { LinkRow, LoadError } from '@/components/organize/parts';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { StatusPill } from '@/components/tournaments/StatusPill';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useMyWork } from '@/hooks/useMyWork';
import { useTheme } from '@/hooks/use-theme';
import { sportNextStep } from '@/lib/nextStep';
import { moduleStatusTone } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { MySport } from '@/types';

export default function MySportsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { sports, loading, error, refreshing, refresh } = useMyWork();

  const open = (s: MySport) => {
    const step = sportNextStep(s);
    if (step?.target === 'seeding') router.push(tournamentRoutes.seeding(s.tournament_id, s.module_id));
    else if (step?.target === 'manage') router.push(tournamentRoutes.moduleManage(s.tournament_id, s.module_id));
    else router.push(tournamentRoutes.module(s.tournament_id, s.module_id));
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
      <Stack.Screen options={{ title: 'My sports', headerLeft: () => <HeaderBack fallback="/tournaments" /> }} />
      {error && <LoadError message={error} saved={sports.length > 0} onRetry={() => void refresh()} />}
      {loading && <SkeletonList Item={TournamentCardSkeleton} count={2} />}
      {!loading && !error && sports.length === 0 && (
        <ThemedText muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>
          You don’t manage any sport right now. An organizer adds you as sport manager.
        </ThemedText>
      )}
      {sports.map((s) => {
        const step = sportNextStep(s);
        return (
          <View key={s.module_id} style={{ gap: Spacing.sm }}>
            <LinkRow
              title={s.module_name}
              sub={[s.tournament_name, step ? `Next: ${step.label}` : null].filter(Boolean).join(' · ')}
              right={<StatusPill tone={moduleStatusTone(s.status)} />}
              onPress={() => open(s)}
            />
            {s.today.map((m) => (
              <LinkRow
                key={m.match_id}
                title={`${m.a_name ?? 'To be decided'} vs ${m.b_name ?? 'To be decided'}`}
                sub={[
                  new Date(m.scheduled_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
                  m.court,
                  m.status === 'completed' || m.status === 'walkover' ? 'Done' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                onPress={() => router.push(tournamentRoutes.moduleMatches(s.tournament_id, s.module_id, 'today'))}
              />
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.lg },
});
