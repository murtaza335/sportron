import { Camera, Edit, Megaphone, Plus, Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/motion/PressableScale';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

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
  /** Hide the FAB (slide down + fade), e.g. while the feed scrolls down. */
  hidden?: boolean;
};

const GAP = 12;
const NUM_ITEMS = 4;
const FAB_SIZE = 56;
const FAB_RADIUS = 28;
const ITEM_STAGGER = 40;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ItemDef = {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  label: string;
  disabled: boolean;
  onPress: () => void;
};

/** One speed-dial entry. Items stagger bottom-up on open and top-down on close. */
function FabItem({ item, index, open }: { item: ItemDef; index: number; open: boolean }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const p = useSharedValue(0);
  // index 0 is the topmost item; the item closest to the FAB (last) appears first.
  const offset = (NUM_ITEMS - index) * (FAB_SIZE + GAP);

  useEffect(() => {
    if (reduced) {
      p.set(withTiming(open ? 1 : 0, { duration: Duration.fast }));
      return;
    }
    p.set(
      open
        ? withDelay((NUM_ITEMS - 1 - index) * ITEM_STAGGER, withSpring(1, Springs.bouncy))
        : withDelay(index * 20, withTiming(0, { duration: Duration.fast })),
    );
  }, [open, index, reduced, p]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, p.value)),
    transform: [
      { translateY: -offset * p.value },
      { scale: 0.6 + 0.4 * p.value },
    ],
  }));

  return (
    <Animated.View style={[styles.menuItemWrapper, style]} pointerEvents={open ? 'auto' : 'none'}>
      <PressableScale
        onPress={item.onPress}
        disabled={item.disabled}
        scaleTo={0.92}
        style={[item.disabled && styles.itemDisabled]}
      >
        <View style={[styles.iconButton, { backgroundColor: theme.accent }]}>
          <item.icon size={22} color={theme.background} strokeWidth={2.5} />
          <ThemedText style={[styles.innerLabel, { color: theme.background }]}>{item.label}</ThemedText>
        </View>
      </PressableScale>
    </Animated.View>
  );
}

export function FABMenu({
  isMember,
  communityId,
  userId: _userId,
  communitySport,
  inCooldown,
  cooldownRemainingMs: _cooldownRemainingMs,
  formatCooldown: _formatCooldown,
  openPing,
  setCreatePostInitialTab,
  setCreatePostModalVisible,
  router,
  onFabMenuClose,
  hidden = false,
}: FABMenuProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [fabMenuOpen, setFabMenuOpen] = useState(false);

  const rotation = useSharedValue(0);
  const backdrop = useSharedValue(0);
  const visible = useSharedValue(1);

  useEffect(() => {
    rotation.set(reduced ? 0 : withSpring(fabMenuOpen ? 45 : 0, Springs.snappy));
    backdrop.set(withTiming(fabMenuOpen ? 0.4 : 0, { duration: Duration.base }));
  }, [fabMenuOpen, reduced, rotation, backdrop]);

  // Collapse the menu when hiding the FAB.
  useEffect(() => {
    visible.set(withTiming(hidden && !fabMenuOpen ? 0 : 1, { duration: Duration.base }));
  }, [hidden, fabMenuOpen, visible]);

  const fabContainerStyle = {
    position: 'absolute' as const,
    bottom: Spacing.lg + insets.bottom,
    right: Spacing.lg,
    zIndex: 200,
    alignItems: 'flex-end' as const,
    height: NUM_ITEMS * (FAB_SIZE + GAP) + FAB_SIZE,
    justifyContent: 'flex-end' as const,
  };

  const closeMenu = useCallback(() => setFabMenuOpen(false), []);

  const toggleMenu = useCallback(() => {
    haptics.light();
    setFabMenuOpen((o) => !o);
    onFabMenuClose();
  }, [onFabMenuClose]);

  const handlePing = useCallback(() => {
    openPing();
    closeMenu();
  }, [openPing, closeMenu]);

  const handleWrite = useCallback(() => {
    setCreatePostInitialTab('write');
    setCreatePostModalVisible(true);
    closeMenu();
  }, [setCreatePostInitialTab, setCreatePostModalVisible, closeMenu]);

  const handlePhoto = useCallback(() => {
    setCreatePostInitialTab('photo');
    setCreatePostModalVisible(true);
    closeMenu();
  }, [setCreatePostInitialTab, setCreatePostModalVisible, closeMenu]);

  const handleMatch = useCallback(() => {
    if (communityId && communitySport) {
      router.push(`/add-match?communityId=${communityId}&sport=${communitySport}`);
    }
    closeMenu();
  }, [communityId, communitySport, router, closeMenu]);

  const animatedFAB = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const containerVisibility = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateY: (1 - visible.value) * 90 }],
  }));

  if (!isMember) return null;

  const items: ItemDef[] = [
    { icon: Megaphone, label: 'PING', disabled: inCooldown, onPress: handlePing },
    { icon: Edit, label: 'WRITE', disabled: false, onPress: handleWrite },
    { icon: Camera, label: 'PHOTO', disabled: false, onPress: handlePhoto },
    { icon: Trophy, label: 'MATCH', disabled: false, onPress: handleMatch },
  ];

  return (
    <>
      {/* Dim backdrop; tap outside dismisses. Stays mounted so it can fade out. */}
      <View style={styles.fabBackdrop} pointerEvents={fabMenuOpen ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.dim, backdropStyle]} />
        <Pressable onPress={closeMenu} style={StyleSheet.absoluteFill} />
      </View>

      <Animated.View style={[fabContainerStyle, containerVisibility]} pointerEvents={hidden && !fabMenuOpen ? 'none' : 'box-none'}>
        <View style={styles.menuItemsContainer} pointerEvents="box-none">
          {items.map((item, index) => (
            <FabItem key={item.label} item={item} index={index} open={fabMenuOpen} />
          ))}
        </View>

        <PressableScale onPress={toggleMenu} scaleTo={0.92} style={[styles.fabMain, { backgroundColor: theme.accent }]}>
          <Animated.View style={animatedFAB}>
            <Plus size={28} color={theme.background} strokeWidth={2.5} />
          </Animated.View>
        </PressableScale>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  fabBackdrop: {
    ...StyleSheet.absoluteFill,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    zIndex: 199,
  },
  dim: {
    backgroundColor: '#000',
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