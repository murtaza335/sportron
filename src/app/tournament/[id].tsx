import { Building2, CalendarDays, MapPin, Settings, Trophy } from 'lucide-react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SkeletonList, TournamentCardSkeleton } from '@/components/skeletons';
import { ChampionsStrip } from '@/components/tournaments/ChampionsStrip';
import { ModuleCard } from '@/components/tournaments/ModuleCard';
import { StatusPill } from '@/components/tournaments/StatusPill';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournament } from '@/hooks/useTournament';
import { formatDateRange, tournamentStatusTone } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detail, loading, refreshing, refresh, isTournamentAdmin } = useTournament(id);
  const [expanded, setExpanded] = useState(false);

  const t = detail?.tournament;
  const liveCount = detail?.modules.filter((m) => m.status === 'in_progress').length ?? 0;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Tournament',
          headerRight: () =>
            isTournamentAdmin ? (
              <Pressable
                onPress={() => router.push(tournamentRoutes.manage(id))}
                hitSlop={12}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
                accessibilityRole="button"
                accessibilityLabel="Manage tournament"
              >
                <Settings size={22} color={theme.text} strokeWidth={2} />
              </Pressable>
            ) : null,
        }}
      />
      {loading && !detail ? (
        <SkeletonList Item={TournamentCardSkeleton} count={2} style={{ padding: Spacing.md }} />
      ) : !t || !detail ? (
        <View style={styles.empty}>
          <Trophy size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">Tournament not found</ThemedText>
          <ThemedText muted>It may be private or no longer available.</ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
          refreshControl={<ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          {t.status === 'cancelled' && (
            <View style={[styles.banner, { backgroundColor: `${theme.error}26` }]}>
              <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '700' }}>
                This tournament was cancelled.
              </ThemedText>
            </View>
          )}

          <View style={[styles.cover, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
            {t.image_url ? (
              <Image source={{ uri: t.image_url }} style={styles.coverImage} resizeMode="cover" />
            ) : (
              <Trophy size={40} color={theme.textSecondary} strokeWidth={1.5} />
            )}
          </View>

          <View style={styles.header}>
            <ThemedText variant="heading">{t.name}</ThemedText>
            <View style={styles.statusRow}>
              <StatusPill tone={tournamentStatusTone(t.status, liveCount)} />
              {formatDateRange(t.starts_at, t.ends_at) && (
                <View style={styles.metaItem}>
                  <CalendarDays size={13} color={theme.textSecondary} strokeWidth={2} />
                  <ThemedText variant="caption" muted>
                    {formatDateRange(t.starts_at, t.ends_at)}
                  </ThemedText>
                </View>
              )}
            </View>
            {(t.organization || t.location) && (
              <View style={styles.statusRow}>
                {t.organization && (
                  <View style={styles.metaItem}>
                    <Building2 size={13} color={theme.textSecondary} strokeWidth={2} />
                    <ThemedText variant="caption" muted>{t.organization}</ThemedText>
                  </View>
                )}
                {t.location && (
                  <View style={styles.metaItem}>
                    <MapPin size={13} color={theme.textSecondary} strokeWidth={2} />
                    <ThemedText variant="caption" muted>{t.location}</ThemedText>
                  </View>
                )}
              </View>
            )}
          </View>

          {detail.champions.length > 0 && (
            <View style={styles.section}>
              <ThemedText variant="label" muted>Champions</ThemedText>
              <ChampionsStrip
                champions={detail.champions}
                onPressChampion={(moduleId) => router.push(tournamentRoutes.module(t.id, moduleId))}
              />
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <ThemedText variant="label" muted>Modules</ThemedText>
              <ThemedText variant="label" muted>{detail.modules.length}</ThemedText>
            </View>
            {detail.modules.length === 0 ? (
              <View style={styles.modulesEmpty}>
                <ThemedText variant="body" style={{ fontWeight: '600' }}>
                  {isTournamentAdmin ? 'Add your first module' : 'Modules coming soon'}
                </ThemedText>
              </View>
            ) : (
              <View style={{ gap: Spacing.sm }}>
                {detail.modules.map((m) => (
                  <ModuleCard key={m.id} tournamentId={t.id} module={m} />
                ))}
              </View>
            )}
            {isTournamentAdmin && t.status !== 'completed' && t.status !== 'cancelled' && (
              <Button
                label="Add module"
                variant="secondary"
                onPress={() => router.push(tournamentRoutes.moduleForm(t.id))}
              />
            )}
          </View>

          {(t.description || detail.admins.length > 0) && (
            <View style={styles.section}>
              <ThemedText variant="label" muted>About</ThemedText>
              {t.description && (
                <>
                  <ThemedText muted numberOfLines={expanded ? undefined : 4}>{t.description}</ThemedText>
                  {t.description.length > 160 && (
                    <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
                      <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                        {expanded ? 'Show less' : 'Read more'}
                      </ThemedText>
                    </Pressable>
                  )}
                </>
              )}
              {detail.admins.length > 0 && (
                <View style={styles.admins}>
                  <ThemedText variant="caption" muted style={{ fontWeight: '700' }}>ADMINS</ThemedText>
                  {detail.admins.map((a) => (
                    <Pressable
                      key={a.id}
                      onPress={() => router.push(tournamentRoutes.profile(a.id))}
                      style={({ pressed }) => [styles.admin, pressed && { opacity: 0.6 }]}
                    >
                      <UserAvatar avatarUrl={a.avatar_url} size={24} />
                      <ThemedText variant="caption">{a.username}</ThemedText>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: Spacing.xxl },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.md,
    gap: Spacing.lg,
  },
  banner: { padding: Spacing.sm, borderRadius: Radius.md, alignItems: 'center' },
  cover: {
    aspectRatio: 16 / 9,
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: { width: '100%', height: '100%' },
  header: { gap: Spacing.sm },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  section: { gap: Spacing.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modulesEmpty: { paddingVertical: Spacing.md, alignItems: 'center' },
  admins: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
