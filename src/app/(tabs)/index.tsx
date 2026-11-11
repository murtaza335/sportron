import { useCallback } from 'react';
import { AnnouncementHost } from '@/components/AnnouncementHost';
import { UpdateBanner } from '@/components/UpdateBanner';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Duration, Springs } from '@/lib/motion';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyReveal } from '@/components/motion/EmptyReveal';
import { FadeInItem } from '@/components/motion/FadeInItem';
import { CommunityCardSkeleton, SkeletonList } from '@/components/skeletons';
import { useFirstLoad } from '@/hooks/useFirstLoad';
import { TipCard } from '@/components/TipCard';
import { ThemedText } from '@/components/ui/Text';
import { CommunityCard } from '@/components/CommunityCard';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useMyCommunities } from '@/hooks/useCommunities';
import { router, useFocusEffect } from 'expo-router';
import { Plus, Users } from 'lucide-react-native';

export default function CommunitiesScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { communities, loading, refreshing, refresh } = useMyCommunities(user?.id);
  const firstLoad = useFirstLoad(loading);

  const rotate = useSharedValue(0);
  const colorStep = useSharedValue(0);
  const iconScale = useSharedValue(1);
  const reduced = useReducedMotion();

  // One-time attention intro on focus: spin + colour cycle, then the plus compresses and releases.
  useFocusEffect(
    useCallback(() => {
      rotate.set(0);
      colorStep.set(0);
      iconScale.set(1);
      if (reduced) return;
      const timer = setTimeout(() => {
        rotate.set(withTiming(1, { duration: Duration.celebrate + 100, easing: Easing.out(Easing.cubic) }));
        colorStep.set(withTiming(4, { duration: Duration.celebrate + 100, easing: Easing.linear }));
        iconScale.set(
          withDelay(
            Duration.celebrate + 100,
            withSequence(
              withTiming(0.75, { duration: Duration.instant }),
              withSpring(1, Springs.bouncy),
            ),
          ),
        );
      }, 600);
      return () => clearTimeout(timer);
    }, [rotate, colorStep, iconScale, reduced]),
  );

  const fabStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      colorStep.value,
      [0, 1, 2, 3, 4],
      [theme.text, theme.accent, theme.info, theme.success, theme.text],
    ),
    transform: [{ rotate: `${rotate.value * 360}deg` }],
  }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: iconScale.value }] }));

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.container, { paddingBottom: Spacing.lg + Math.max(insets.bottom, 56) }]}
        refreshControl={
          <ThemedRefreshControl refreshing={refreshing} onRefresh={refresh} />
        }
      >
        <UpdateBanner />
        <AnnouncementHost placement="home_banner" />
        <TipCard id="communities" />
        {loading ? (
          <SkeletonList Item={CommunityCardSkeleton} count={3} />
        ) : communities.length === 0 ? (
          <EmptyReveal
            style={styles.empty}
            icon={<Users size={48} color={theme.textSecondary} strokeWidth={1.5} />}>
            <ThemedText variant="body" muted style={styles.emptyText}>
              You haven&apos;t joined any communities yet
            </ThemedText>
            <ThemedText variant="caption" muted>
              Tap the plus icon to discover communities
            </ThemedText>
          </EmptyReveal>
        ) : (
          <View style={styles.grid}>
            {communities.map((community, index) => (
              <FadeInItem key={community.id} index={index} animate={firstLoad}>
                <CommunityCard community={community} />
              </FadeInItem>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Animated floating action button without glow */}
      <Animated.View style={[styles.fab, fabStyle]}>
        <Pressable
          onPress={() => router.push('/discover')}
          style={({ pressed }) => [styles.fabPressable, pressed && { opacity: 0.7, transform: [{ scale: 0.92 }] }]}
          hitSlop={12}
          accessibilityLabel="Discover communities"
          accessibilityRole="button"
        >
          <Animated.View style={iconStyle}>
            <Plus size={34} color={theme.background} strokeWidth={3} />
          </Animated.View>
        </Pressable>
      </Animated.View>
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
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
  },
});
