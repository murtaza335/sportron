import Animated from 'react-native-reanimated';
import { FadeInItem } from '@/components/motion/FadeInItem';
import { PressableScale } from '@/components/motion/PressableScale';
import { useFocusBorder } from '@/components/motion/useFocusBorder';
import { CommunityCardSkeleton, SkeletonList } from '@/components/skeletons';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { haptics } from '@/lib/haptics';
import { router, Stack } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';

import { ThemedText } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { EmptyReveal } from '@/components/motion/EmptyReveal';
import { CommunityCard } from '@/components/CommunityCard';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunities } from '@/hooks/useCommunities';
import { fetchMyCommunityMemberships } from '@/services/communities';
import type { CommunityMemberRole, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';
import { HScrollView } from '@/components/HScrollView';

const ALL_SPORTS = Object.keys(SPORT_LABELS) as Sport[];

export default function DiscoverScreen() {
  const theme = useTheme();
  const searchBorder = useFocusBorder(theme.border, theme.inputBorderFocus);
  const { user } = useAuth();
  const { communities, loading, refreshing, refresh } = useCommunities();
  const [membershipsLoaded, setMembershipsLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [sortBy, setSortBy] = useState<'popular' | 'new'>('popular');
  // New RPC (migration 120) inlines the caller's role; legacy servers need the extra memberships request.
  const hasInlineRole = communities.some((c) => c.popularity !== undefined);
  const [fetchedMap, setMembershipMap] = useState<Record<string, CommunityMemberRole>>({});
  const membershipMap = useMemo(() => {
    if (!hasInlineRole) return fetchedMap;
    const map: Record<string, CommunityMemberRole> = {};
    for (const c of communities) if (c.my_role) map[c.id] = c.my_role;
    return map;
  }, [hasInlineRole, fetchedMap, communities]);
  const membersReady = hasInlineRole || membershipsLoaded;
  const firstLoad = useFirstLoad(loading || (!!user?.id && !membersReady));

  useEffect(() => {
    if (!user?.id) return;
    fetchMyCommunityMemberships(user.id)
      .then((memberships) => {
        const map: Record<string, CommunityMemberRole> = {};
        for (const m of memberships) {
          map[m.community_id] = m.role;
        }
        setMembershipMap(map);
      })
      .catch(console.error)
      .finally(() => setMembershipsLoaded(true));
  }, [user?.id]);

  const filteredCommunities = useMemo(() => {
    let list = communities;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (selectedSport) {
      list = list.filter((c) => c.sport === selectedSport);
    }
    const rank = (c: (typeof list)[number]) => c.popularity ?? c.member_count ?? 0;
    return [...list].sort((a, b) => {
      if (sortBy === 'new') return b.created_at.localeCompare(a.created_at);
      // Popular: keep non-members first (Discover is for finding new ones), then by score.
      const am = membershipMap[a.id] ? 1 : 0;
      const bm = membershipMap[b.id] ? 1 : 0;
      return am - bm || rank(b) - rank(a);
    });
  }, [communities, search, selectedSport, sortBy, membershipMap]);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: 'Discover',
          headerStyle: { backgroundColor: theme.background },
          headerShadowVisible: false,
          headerTintColor: theme.text,
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/create-community')}
              style={({ pressed }) => ({
                marginRight: Spacing.md,
                paddingTop: Platform.OS === 'ios' ? 2 : 0,
                opacity: pressed ? 0.6 : 1,
              })}
              hitSlop={12}
              accessibilityLabel="Create community"
              accessibilityRole="button"
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: theme.accent,
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.4,
                  shadowRadius: 4,
                  elevation: 0,
                }}
              >
                <Plus size={20} color={theme.chatBubbleMineText} strokeWidth={3} />
              </View>
            </Pressable>
          ),
        }}
      />
      <View style={[styles.searchContainer, { borderBottomColor: theme.border }]}>
        <Animated.View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, searchBorder.style]}>
          <TextInput
            {...searchBorder.handlers}
            style={[styles.searchInput, { color: theme.text }]}
            placeholder="Search communities..."
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </Animated.View>
        <HScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {(['popular', 'new'] as const).map((k) => (
            <PressableScale
              key={k}
              scaleTo={0.94}
              onPress={() => {
                if (sortBy !== k) haptics.selection();
                setSortBy(k);
              }}
              style={[
                styles.filterChip,
                { backgroundColor: sortBy === k ? theme.accent : theme.backgroundElement },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{ color: sortBy === k ? theme.chatBubbleMineText : theme.textSecondary, fontWeight: '700' }}
              >
                {k === 'popular' ? '🔥 Popular' : '✨ New'}
              </ThemedText>
            </PressableScale>
          ))}
          <View style={{ width: 1, backgroundColor: theme.border, marginHorizontal: 2 }} />
          <PressableScale
            scaleTo={0.94}
            onPress={() => {
              if (selectedSport) haptics.selection();
              setSelectedSport(null);
            }}
            style={[
              styles.filterChip,
              { backgroundColor: !selectedSport ? theme.text : theme.backgroundElement },
            ]}
          >
            <ThemedText
              variant="caption"
              style={{ color: !selectedSport ? theme.background : theme.textSecondary, fontWeight: '700' }}
            >
              All
            </ThemedText>
          </PressableScale>
          {ALL_SPORTS.map((sport) => (
            <PressableScale
              key={sport}
              scaleTo={0.94}
              onPress={() => {
                haptics.selection();
                setSelectedSport(sport === selectedSport ? null : sport);
              }}
              style={[
                styles.filterChip,
                { backgroundColor: selectedSport === sport ? theme.text : theme.backgroundElement },
              ]}
            >
              <ThemedText
                variant="caption"
                style={{ color: selectedSport === sport ? theme.background : theme.textSecondary, fontWeight: '700' }}
              >
                {SPORT_LABELS[sport]}
              </ThemedText>
            </PressableScale>
          ))}
        </HScrollView>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        refreshControl={
          <ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {loading || (!!user?.id && !membersReady) ? (
          <SkeletonList Item={CommunityCardSkeleton} count={3} />
        ) : filteredCommunities.length === 0 ? (
          <EmptyReveal
            style={styles.empty}
            icon={<Search size={44} color={theme.textSecondary} strokeWidth={1.5} />}>
            <ThemedText variant="heading" style={styles.emptyText}>
              {search.trim()
                ? `Nothing called "${search.trim()}" yet`
                : selectedSport
                  ? `No ${SPORT_LABELS[selectedSport]} communities yet`
                  : 'No communities yet'}
            </ThemedText>
            <ThemedText variant="body" muted style={styles.emptyText}>
              {selectedSport
                ? `Be the first — start one and the ${SPORT_LABELS[selectedSport]} players around you can find and join it.`
                : 'Start the first community in your area.'}
            </ThemedText>
            <Button
              label={
                search.trim()
                  ? `Create "${search.trim().slice(0, 24)}"`
                  : selectedSport
                    ? `Create a ${SPORT_LABELS[selectedSport]} community`
                    : 'Create a community'
              }
              onPress={() =>
                router.push({
                  pathname: '/create-community',
                  params: {
                    ...(selectedSport ? { sport: selectedSport } : {}),
                    ...(search.trim() ? { name: search.trim() } : {}),
                  },
                })
              }
              buttonStyle={{ marginTop: Spacing.sm }}
            />
          </EmptyReveal>
        ) : (
          <View style={styles.grid}>
            {filteredCommunities.map((community, index) => (
              <FadeInItem key={community.id} index={index} animate={firstLoad}>
                <CommunityCard community={community} membershipRole={membershipMap[community.id] ?? null} />
              </FadeInItem>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  searchContainer: {
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
  },
  searchBar: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    height: 40,
    justifyContent: 'center',
  },
  searchInput: {
    fontSize: 15,
    fontWeight: '500',
  },
  filterRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
  },
  grid: {
    gap: Spacing.sm,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxxl,
  },
  emptyText: {
    fontWeight: '600',
    textAlign: 'center',
  },
});