import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/Text';
import { CommunityCard } from '@/components/CommunityCard';
import { StreakHeader } from '@/components/StreakHeader';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useMyCommunities } from '@/hooks/useCommunities';
import { router } from 'expo-router';
import { Compass, Users } from 'lucide-react-native';

export default function CommunitiesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { communities, loading, refreshing, refresh } = useMyCommunities(user?.id);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.container, { paddingBottom: Spacing.lg + Math.max(insets.bottom, 56) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.text} />
        }
      >
        <StreakHeader />
        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : communities.length === 0 ? (
          <View style={styles.empty}>
            <Users size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="body" muted style={styles.emptyText}>
              You haven&apos;t joined any communities yet
            </ThemedText>
            <ThemedText variant="caption" muted>
              Tap the compass icon to discover communities
            </ThemedText>
          </View>
        ) : (
          <View style={styles.grid}>
            {communities.map((community) => (
              <CommunityCard
                key={community.id}
                community={community}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Floating compass button */}
      <Pressable
        onPress={() => router.push('/discover')}
        style={[styles.fab, { backgroundColor: theme.text }]}
        hitSlop={12}
        accessibilityLabel="Discover communities"
        accessibilityRole="button"
      >
        <Compass size={24} color={theme.background} strokeWidth={2.5} />
      </Pressable>
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
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
});
