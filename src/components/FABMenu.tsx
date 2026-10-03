import { Camera, Edit, Megaphone, Plus, Trophy } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type FABMenuProps = {
  isMember: boolean;
  communityId: string | undefined;
  userId: string | undefined;
  communitySport: string | undefined;
  inCooldown: boolean;
  cooldownRemainingMs: number;
  formatCooldown: (ms: number) => string;
  openPing: () => void;
  setCreatePostInitialTab: (tab: 'write' | 'photo') => void;
  setCreatePostModalVisible: (visible: boolean) => void;
  router: any;
  onFabMenuClose: () => void;
};

const GAP = 12;
const NUM_ITEMS = 4;
const FAB_SIZE = 56;
const FAB_RADIUS = 28;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function FABMenu({
  isMember,
  communityId,
  userId,
  communitySport,
  inCooldown,
  cooldownRemainingMs,
  formatCooldown,
  openPing,
  setCreatePostInitialTab,
  setCreatePostModalVisible,
  router,
  onFabMenuClose,
}: FABMenuProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const rotation = useSharedValue<number>(0);

  const progress0 = useSharedValue(0);
  const progress1 = useSharedValue(0);
  const progress2 = useSharedValue(0);
  const progress3 = useSharedValue(0);

  const itemProgress = useMemo(
    () => [progress0, progress1, progress2, progress3],
    [progress0, progress1, progress2, progress3]
  );

  const springConfig = useMemo(
    () => ({ damping: 16, stiffness: 180, mass: 0.8, overshootClamping: true }),
    []
  );

  const fabContainerStyle = {
    position: 'absolute' as const,
    bottom: Spacing.lg + insets.bottom,
    right: Spacing.lg,
    zIndex: 200,
    alignItems: 'flex-end' as const,
    height: NUM_ITEMS * (FAB_SIZE + GAP) + FAB_SIZE,
    justifyContent: 'flex-end' as const,
  };

  const closeMenu = useCallback(() => {
    setFabMenuOpen(false);
    runOnJS(() => { rotation.value = withSpring(0); })();

    itemProgress.forEach((item, index) => {
      const delay = index * 20;
      setTimeout(() => {
        item.value = withTiming(0, { duration: 100, easing: Easing.in(Easing.cubic) });
      }, delay);
    });
  }, [rotation, itemProgress]);

  const toggleMenu = useCallback(() => {
    const nextState = !fabMenuOpen;
    setFabMenuOpen(nextState);

    if (nextState) {
      runOnJS(() => { rotation.value = withSpring(45, springConfig); })();

      itemProgress.forEach((item, index) => {
        const delay = (NUM_ITEMS - 1 - index) * 30;
        setTimeout(() => {
          item.value = withSpring(1, springConfig);
        }, delay);
      });
    } else {
      closeMenu();
    }
    onFabMenuClose();
  }, [fabMenuOpen, onFabMenuClose, closeMenu, rotation, itemProgress, springConfig]);

  const handlePing = useCallback(() => {
    openPing();
    setTimeout(closeMenu, 50);
  }, [openPing, closeMenu]);

  const handleWrite = useCallback(() => {
    setCreatePostInitialTab('write');
    setCreatePostModalVisible(true);
    setTimeout(closeMenu, 50);
  }, [setCreatePostInitialTab, setCreatePostModalVisible, closeMenu]);

  const handlePhoto = useCallback(() => {
    setCreatePostInitialTab('photo');
    setCreatePostModalVisible(true);
    setTimeout(closeMenu, 50);
  }, [setCreatePostInitialTab, setCreatePostModalVisible, closeMenu]);

  const handleMatch = useCallback(() => {
    if (communityId && communitySport) {
      router.push(`/add-match?communityId=${communityId}&sport=${communitySport}`);
    }
    setTimeout(closeMenu, 50);
  }, [communityId, communitySport, router, closeMenu]);

  const animatedFAB = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const animatedStyle0 = useAnimatedStyle(() => {
    const itemOffset = (NUM_ITEMS - 0) * (FAB_SIZE + GAP);
    return {
      transform: [
        { translateY: interpolate(progress0.value, [0, 1], [0, -itemOffset], Extrapolation.CLAMP) },
        { scale: interpolate(progress0.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(progress0.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  const animatedStyle1 = useAnimatedStyle(() => {
    const itemOffset = (NUM_ITEMS - 1) * (FAB_SIZE + GAP);
    return {
      transform: [
        { translateY: interpolate(progress1.value, [0, 1], [0, -itemOffset], Extrapolation.CLAMP) },
        { scale: interpolate(progress1.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(progress1.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  const animatedStyle2 = useAnimatedStyle(() => {
    const itemOffset = (NUM_ITEMS - 2) * (FAB_SIZE + GAP);
    return {
      transform: [
        { translateY: interpolate(progress2.value, [0, 1], [0, -itemOffset], Extrapolation.CLAMP) },
        { scale: interpolate(progress2.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(progress2.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  const animatedStyle3 = useAnimatedStyle(() => {
    const itemOffset = (NUM_ITEMS - 3) * (FAB_SIZE + GAP);
    return {
      transform: [
        { translateY: interpolate(progress3.value, [0, 1], [0, -itemOffset], Extrapolation.CLAMP) },
        { scale: interpolate(progress3.value, [0, 1], [0.5, 1], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(progress3.value, [0, 1], [0, 1], Extrapolation.CLAMP),
    };
  });

  const animatedStyles = [animatedStyle0, animatedStyle1, animatedStyle2, animatedStyle3];

  if (!isMember) return null;

  return (
    <>
      {/* Invisible overlay for tap-outside dismiss */}
      {fabMenuOpen && (
        <View style={styles.fabBackdrop}>
          <Pressable onPress={closeMenu} style={StyleSheet.absoluteFill} />
        </View>
      )}

      <View style={fabContainerStyle} pointerEvents="box-none">
        {/* Action items container */}
        <View style={styles.menuItemsContainer} pointerEvents="box-none">
          {[
            { icon: Megaphone, label: 'PING', disabled: inCooldown, onPress: handlePing },
            { icon: Edit, label: 'WRITE', disabled: false, onPress: handleWrite },
            { icon: Camera, label: 'PHOTO', disabled: false, onPress: handlePhoto },
            { icon: Trophy, label: 'MATCH', disabled: false, onPress: handleMatch },
          ].map((item, index) => (
            <Animated.View
              key={item.label}
              style={[styles.menuItemWrapper, animatedStyles[index]]}
              pointerEvents={fabMenuOpen ? 'auto' : 'none'}
            >
              <Pressable
                onPress={item.onPress}
                disabled={item.disabled}
                style={[item.disabled && styles.itemDisabled]}
              >
                <View style={[styles.iconButton, { backgroundColor: theme.accent }]}>
                  <item.icon size={22} color={theme.background} strokeWidth={2.5} />
                  <ThemedText style={[styles.innerLabel, { color: theme.background }]}>
                    {item.label}
                  </ThemedText>
                </View>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {/* Main Floating Action Button */}
        <Pressable
          onPress={toggleMenu}
          style={({ pressed }) => [
            styles.fabMain,
            { backgroundColor: theme.accent },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Animated.View style={animatedFAB}>
            <Plus size={28} color={theme.background} strokeWidth={2.5} />
          </Animated.View>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fabBackdrop: {
    ...StyleSheet.absoluteFill,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    backgroundColor: 'transparent',
    zIndex: 199,
  },
  menuItemsContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    alignItems: 'flex-end',
  },
  menuItemWrapper: {
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  itemDisabled: {
    opacity: 0.5,
  },
  iconButton: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  innerLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  fabMain: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    marginBottom: 8,
  },
});