import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { LoadError } from '@/components/organize/parts';
import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useCachedLoad } from '@/hooks/useCachedLoad';
import { useTheme } from '@/hooks/use-theme';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { fetchOrgActivity } from '@/services/organizations';
import type { OrgActivity } from '@/types';

function byDay(rows: OrgActivity[]) {
  const days: { title: string; data: OrgActivity[] }[] = [];
  for (const r of rows) {
    const title = new Date(r.created_at).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
    const last = days[days.length - 1];
    if (last?.title === title) last.data.push(r);
    else days.push({ title, data: [r] });
  }
  return days;
}

export default function OrgActivityScreen() {
  const { org } = useLocalSearchParams<{ org: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const first = useCachedLoad(org && user ? `org-activity:${user.id}:${org}` : null, () => fetchOrgActivity(org));
  const [older, setOlder] = useState<OrgActivity[]>([]);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const rows = useMemo(() => {
    const head = first.data ?? [];
    const oldestHead = head.length ? head[head.length - 1].id : Infinity;
    return [...head, ...older.filter((o) => o.id < oldestHead)];
  }, [first.data, older]);
  const sections = useMemo(() => byDay(rows), [rows]);

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const next = await fetchOrgActivity(org, rows[rows.length - 1]?.id ?? null);
      setOlder((o) => [...o, ...next]);
      setMore(next.length === 50);
    } catch (e) {
      setMoreError(friendlyTournamentError(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: 'Activity', headerLeft: () => <HeaderBack fallback={tournamentRoutes.organize(org)} /> }} />
      <SectionList
        sections={sections}
        keyExtractor={(r) => String(r.id)}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.list, { paddingBottom: Spacing.xl + insets.bottom }]}
        refreshControl={
          <ThemedRefreshControl
            refreshing={first.refreshing}
            onRefresh={() => {
              setOlder([]);
              setMore(true);
              void first.refresh();
            }}
          />
        }
        renderSectionHeader={({ section }) => (
          <ThemedText variant="label" muted style={styles.day}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item }) => (
          <Pressable
            disabled={!item.tournament_id}
            onPress={() => item.tournament_id && router.push(tournamentRoutes.tournament(item.tournament_id))}
            style={styles.row}
          >
            <ThemedText>
              <ThemedText style={{ fontWeight: '700' }}>{item.actor}</ThemedText> {item.summary}
            </ThemedText>
            <ThemedText variant="caption" muted>
              {new Date(item.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
            </ThemedText>
          </Pressable>
        )}
        ListHeaderComponent={
          first.error ? <LoadError message={first.error} saved={rows.length > 0} onRetry={() => void first.refresh()} /> : null
        }
        ListFooterComponent={
          rows.length >= 50 && more ? (
            <View style={{ gap: Spacing.xs, marginTop: Spacing.md }}>
              {moreError && <ThemedText variant="caption" style={{ color: theme.error }}>{moreError}</ThemedText>}
              <Button label="Show older" variant="secondary" loading={loadingMore} onPress={() => void loadMore()} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          first.loading ? (
            <SkeletonList Item={TournamentCardSkeleton} count={3} />
          ) : first.error ? null : (
            <ThemedText muted style={{ textAlign: 'center', marginTop: Spacing.xl }}>Nothing has happened yet.</ThemedText>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md },
  day: { marginTop: Spacing.md, marginBottom: Spacing.xs },
  row: { paddingVertical: Spacing.sm, gap: 2 },
});
