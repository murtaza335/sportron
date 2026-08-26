import { useCallback, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

  const rotateAnim = useRef(new Animated.Value(0));
  const colorAnim = useRef(new Animated.Value(0));
  const iconScaleAnim = useRef(new Animated.Value(1));

  useFocusEffect(
    useCallback(() => {
      rotateAnim.current.setValue(0);
      colorAnim.current.setValue(0);
      iconScaleAnim.current.setValue(1);

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(rotateAnim.current, {
            toValue: 1,
            duration: 1000,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
          }),
          Animated.sequence([
            Animated.timing(colorAnim.current, {
              toValue: 1, // #3B82F6 Electric Blue
              duration: 250,
              useNativeDriver: false,
            }),
            Animated.timing(colorAnim.current, {
              toValue: 2, // #06B6D4 Neon Cyan
              duration: 250,
              useNativeDriver: false,
            }),
            Animated.timing(colorAnim.current, {
              toValue: 3, // #10B981 Bright Green
              duration: 250,
              useNativeDriver: false,
            }),
            Animated.timing(colorAnim.current, {
              toValue: 4, // Back to base theme.text
              duration: 250,
              useNativeDriver: false,
            }),
          ]),
        ]).start(() => {
          // Compress & release effect on Plus icon after 1 round cycle finishes
          Animated.sequence([
            Animated.timing(iconScaleAnim.current, {
              toValue: 0.75, // Compress
              duration: 120,
              easing: Easing.inOut(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(iconScaleAnim.current, {
              toValue: 1.15, // Release bounce
              duration: 150,
              easing: Easing.out(Easing.back(1.5)),
              useNativeDriver: false,
            }),
            Animated.timing(iconScaleAnim.current, {
              toValue: 1.0, // Settle
              duration: 100,
              easing: Easing.out(Easing.quad),
              useNativeDriver: false,
            }),
          ]).start();
        });
      }, 600);

      return () => clearTimeout(timer);
    }, [])
  );

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.container, { paddingBottom: Spacing.lg + Math.max(insets.bottom, 56) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.text} />
        }
      >
        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : communities.length === 0 ? (
          <View style={styles.empty}>
            <Users size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="body" muted style={styles.emptyText}>
              You haven&apos;t joined any communities yet
            </ThemedText>
            <ThemedText variant="caption" muted>
              Tap the plus icon to discover communities
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

      {/* Animated floating action button without glow */}
      <Animated.View
        style={[
          styles.fab,
          {
            // eslint-disable-next-line react-hooks/refs
            backgroundColor: colorAnim.current.interpolate({
              inputRange: [0, 1, 2, 3, 4],
              outputRange: [theme.text, '#3B82F6', '#06B6D4', '#10B981', theme.text],
            }),
            transform: [
              {
                // eslint-disable-next-line react-hooks/refs
                rotate: rotateAnim.current.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      >
        <Pressable
          onPress={() => router.push('/discover')}
          style={styles.fabPressable}
          hitSlop={12}
          accessibilityLabel="Discover communities"
          accessibilityRole="button"
        >
          {/* eslint-disable-next-line react-hooks/refs */}
          <Animated.View style={{ transform: [{ scale: iconScaleAnim.current }] }}>
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
