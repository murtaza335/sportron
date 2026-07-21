import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunities, useMyCommunities } from '@/hooks/useCommunities';
import { fetchMyCommunityMemberships } from '@/services/communities';
import type { CommunityMemberRole, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';
import { useNavigation, useRouter } from 'expo-router';
import { Compass, ShieldCheck, Users, X } from 'lucide-react-native';

const ALL_SPORTS = Object.keys(SPORT_LABELS) as Sport[];

export default function CommunitiesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { communities: myCommunities, loading: myLoading, refreshing: myRefreshing, refresh: myRefresh } = useMyCommunities(user?.id);
  const { communities: allCommunities, loading: allLoading, refreshing: allRefreshing, refresh: allRefresh } = useCommunities();

  const navigation = useNavigation();
  const [discovering, setDiscovering] = useState(false);
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

  const toggleDiscover = useCallback(() => {
    setDiscovering((prev) => !prev);
    setSearch('');
    setSelectedSport(null);
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={toggleDiscover}
          style={{ marginRight: Spacing.md, paddingTop: Platform.OS === 'ios' ? 8 : 0 }}
          hitSlop={12}
          accessibilityLabel={discovering ? 'Close discover' : 'Discover communities'}
          accessibilityRole="button"
        >
          <View style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: theme.backgroundElement,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
          }}>
            {discovering ? (
              <X size={18} color={theme.text} strokeWidth={2.5} />
            ) : (
              <Compass size={18} color={theme.text} strokeWidth={2.5} />
            )}
          </View>
        </Pressable>
      ),
    });
  }, [navigation, toggleDiscover, discovering, theme]);

  const filteredCommunities = useMemo(() => {
    let list = allCommunities;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    if (selectedSport) {
      list = list.filter((c) => c.sport === selectedSport);
    }
    return list;
  }, [allCommunities, search, selectedSport]);

  const loading = discovering ? allLoading : myLoading;
  const refreshing = discovering ? allRefreshing : myRefreshing;
  const onRefresh = discovering ? allRefresh : myRefresh;
  const communities = discovering ? filteredCommunities : myCommunities;

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      {discovering && (
        <View style={[styles.searchContainer, { borderBottomColor: theme.border }]}>
          <View style={[styles.searchBar, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search communities..."
              placeholderTextColor={theme.textSecondary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <Pressable
              onPress={() => setSelectedSport(null)}
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
            </Pressable>
            {ALL_SPORTS.map((sport) => (
              <Pressable
                key={sport}
                onPress={() => setSelectedSport(sport === selectedSport ? null : sport)}
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
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text} />
        }
      >
        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : communities.length === 0 ? (
          <View style={styles.empty}>
            <Users size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="body" muted style={styles.emptyText}>
              {discovering ? 'No communities found' : "You haven't joined any communities yet"}
            </ThemedText>
            {!discovering && (
              <ThemedText variant="caption" muted>
                Tap the compass icon to discover communities
              </ThemedText>
            )}
          </View>
        ) : (
          <View style={styles.grid}>
            {communities.map((community) => (
              <Pressable
                key={community.id}
                onPress={() => router.push(`/community/${community.id}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
              >
                <Card style={styles.communityCard}>
                  <View style={[styles.avatarCircle, { backgroundColor: theme.text, opacity: 0.1 }]}>
                    <ThemedText variant="heading" style={styles.avatarText}>
                      {community.name.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.communityInfo}>
                    <ThemedText variant="body" style={styles.communityName} numberOfLines={1}>
                      {community.name}
                    </ThemedText>
                    {community.description && (
                      <ThemedText variant="caption" muted numberOfLines={2} style={styles.communityDesc}>
                        {community.description}
                      </ThemedText>
                    )}
                    <View style={styles.metaRow}>
                      <View style={[styles.metaBadge, { backgroundColor: theme.backgroundSelected }]}>
                        <ThemedText variant="caption" muted style={styles.metaBadgeText}>
                          {SPORT_LABELS[community.sport]}
                        </ThemedText>
                      </View>
                      <Users size={12} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted>
                        {community.member_count ?? 0}
                      </ThemedText>
                      <View style={[styles.metaBadge, { backgroundColor: theme.backgroundSelected }]}>
                        <ThemedText variant="caption" muted style={styles.metaBadgeText}>
                          {community.visibility === 'public' ? 'Public' : 'Private'}
                        </ThemedText>
                      </View>
                      {discovering && membershipMap[community.id] && (
                        <View style={[
                          styles.metaBadge,
                          styles.memberTag,
                          {
                            backgroundColor: membershipMap[community.id] === 'admin'
                              ? '#F59E0B20'
                              : '#3B82F620',
                          },
                        ]}>
                          <ShieldCheck
                            size={10}
                            color={membershipMap[community.id] === 'admin' ? '#D97706' : '#2563EB'}
                            strokeWidth={2.5}
                          />
                          <ThemedText
                            variant="caption"
                            style={{
                              fontSize: 10,
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              color: membershipMap[community.id] === 'admin' ? '#D97706' : '#2563EB',
                            }}
                          >
                            {membershipMap[community.id] === 'admin' ? 'Admin' : 'Member'}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  </View>
                </Card>
              </Pressable>
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
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
  },
  communityInfo: {
    flex: 1,
    gap: 2,
  },
  communityName: {
    fontWeight: '700',
  },
  communityDesc: {
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  metaBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  memberTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
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
