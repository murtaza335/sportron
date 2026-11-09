import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { PressableScale } from '@/components/motion/PressableScale';
import { useFocusBorder } from '@/components/motion/useFocusBorder';
import { CommunityCardSkeleton, SkeletonList } from '@/components/skeletons';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { haptics } from '@/lib/haptics';
import { Duration, RM, STAGGER_MAX_ITEMS, STAGGER_MS, LayoutShift } from '@/lib/motion';
import { router, Stack } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';

import { ThemedText } from '@/components/ui/Text';
import { CommunityCard } from '@/components/CommunityCard';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunities } from '@/hooks/useCommunities';
import { fetchMyCommunityMemberships } from '@/services/communities';
import type { CommunityMemberRole, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';

const ALL_SPORTS = Object.keys(SPORT_LABELS) as Sport[];

export default function DiscoverScreen() {
  const theme = useTheme();
  const searchBorder = useFocusBorder(theme.border, theme.inputBorderFocus);
  const { user } = useAuth();
  const { communities, loading, refreshing, refresh } = useCommunities();
  const firstLoad = useFirstLoad(loading);
  const [search, setSearch] = useState('');
  const [selectedSport, setSelectedSport] = useState<Sport | null>(null);
  const [membershipMap, setMembershipMap] = useState<Record<string, CommunityMemberRole>>({});

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
      .catch(console.error);
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
    return list;
  }, [communities, search, selectedSport]);

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
                  elevation: 4,
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
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
        </ScrollView>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        refreshControl={
          <ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        {loading ? (
          <SkeletonList Item={CommunityCardSkeleton} count={3} />
        ) : filteredCommunities.length === 0 ? (
          <View style={styles.empty}>
            <ThemedText variant="body" muted style={styles.emptyText}>
              No communities found
            </ThemedText>
          </View>
        ) : (
          <View style={styles.grid}>
            {filteredCommunities.map((community, index) => (
              <Animated.View
                key={community.id}
                layout={LayoutShift}
                entering={firstLoad ? FadeInDown.delay(Math.min(index, STAGGER_MAX_ITEMS) * STAGGER_MS).duration(Duration.base).reduceMotion(RM) : FadeIn.duration(Duration.base).reduceMotion(RM)}
                exiting={FadeOut.duration(Duration.fast).reduceMotion(RM)}>
                <CommunityCard community={community} membershipRole={membershipMap[community.id] ?? null} />
              </Animated.View>
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
  },
});