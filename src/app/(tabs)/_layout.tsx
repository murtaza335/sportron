import { router, Tabs, useIsFocused } from 'expo-router';
import { CalendarDays, Activity, History, MessageSquare, Plus, Trophy, Users, X, User } from 'lucide-react-native';
import { ColorValue, Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useState, useSyncExternalStore, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedFlame, type FlameState } from '@/components/motion/AnimatedFlame';
import { AnimatedNumber } from '@/components/motion/AnimatedNumber';
import { AnimatedBadge } from '@/components/motion/AnimatedBadge';
import { PressableScale } from '@/components/motion/PressableScale';
import { StreakModal } from '@/components/StreakModal';
import { TabBarBumpBackground } from '@/components/tournaments/TabBarBumpBackground';
import { TournamentTabBarButton } from '@/components/tournaments/TournamentTabBarButton';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';
import { useStreak } from '@/hooks/useStreak';
import {
  getChatUnreadCount,
  subscribeChatUnreadCount,
} from '@/lib/chatUnreadStore';
import {
  getSessionsView,
  setSessionsView,
  subscribeSessionsView,
} from '@/lib/sessionsView';
import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_DOT_KEY = 'profile_dot_viewed_version';
const CURRENT_WHATS_NEW_VERSION = '1.0.1';

async function getProfileDotViewedVersion(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PROFILE_DOT_KEY);
  } catch {
    return null;
  }
}

function ProfileTabIcon({ color, size }: { color: ColorValue; size: number }) {
  const theme = useTheme();
  const [showDot, setShowDot] = useState(false);

  useEffect(() => {
    const check = async () => {
      const viewed = await getProfileDotViewedVersion();
      setShowDot(viewed !== CURRENT_WHATS_NEW_VERSION);
    };
    check();
  }, []);

  return (
    <View style={{ position: 'relative' }}>
      <User size={size} color={color} strokeWidth={2.2} />
      <AnimatedBadge
        visible={showDot}
        size={10}
        style={{ position: 'absolute', top: -2, right: -2, borderWidth: 2, borderColor: theme.background }}
      />
    </View>
  );
}

/** Active tab icon springs up a touch when it becomes focused. */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  useEffect(() => {
    if (reduced || !focused) {
      scale.set(1);
      return;
    }
    scale.set(withSequence(withTiming(1.06, { duration: Duration.instant }), withSpring(1, Springs.bouncy)));
  }, [focused, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function DefaultHeaderTitle({ title }: { title: string }) {
  const theme = useTheme();

  return (
    <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.3 }}>
      {title}
    </Text>
  );
}

function SessionsHeaderRight() {
  const theme = useTheme();
  const isHistory = useSyncExternalStore(subscribeSessionsView, getSessionsView) === 'history';

  return (
    <Pressable
      onPress={() => setSessionsView(isHistory ? 'new' : 'history')}
      style={({ pressed }) => [{ marginRight: Spacing.md, paddingTop: Platform.OS === 'ios' ? 8 : 0 }, pressed && { opacity: 0.6 }]}
      hitSlop={12}
      accessibilityLabel={isHistory ? 'Show open sessions' : 'Show session history'}
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
        borderColor: isHistory ? theme.text : theme.border,
      }}>
        {isHistory ? (
          <X size={18} color={theme.text} strokeWidth={2.5} />
        ) : (
          <History size={18} color={theme.textSecondary} strokeWidth={2.5} />
        )}
      </View>
    </Pressable>
  );
}

function CommunitiesHeaderProfile() {
  const { profile } = useAuth();

  return (
    <PressableScale
      scaleTo={0.9}
      onPress={() => router.navigate('/profile')}
      style={{ marginRight: Spacing.md, paddingTop: Platform.OS === 'ios' ? 4 : 0 }}
      hitSlop={12}
      accessibilityLabel="Open profile"
      accessibilityRole="button"
    >
      <UserAvatar avatarUrl={profile?.avatar_url} size={34} />
    </PressableScale>
  );
}

function CreateSessionButton() {
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const breathe = useSharedValue(0);

  // Calm 2.4s breathing loop; paused when the Sessions tab isn't focused and when reduced motion is on.
  useEffect(() => {
    if (reduced || !focused) {
      breathe.set(withTiming(0, { duration: Duration.fast }));
      return;
    }
    breathe.set(
      withRepeat(withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => breathe.set(0);
  }, [reduced, focused, breathe]);

  const glow = useAnimatedStyle(() => ({
    shadowOpacity: 0.3 + breathe.value * 0.3,
    shadowRadius: 8 + breathe.value * 8,
  }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.08 }] }));

  return (
    <View>
      <Animated.View
        style={[
          {
            shadowColor: '#10B981',
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          },
          glow,
        ]}
      >
        <PressableScale
          onPress={() => router.navigate('/create-session')}
          scaleTo={0.88}
          haptic="light"
          style={{
            marginLeft: Spacing.md,
            paddingTop: Platform.OS === 'ios' ? 4 : 0,
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#10B981',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          hitSlop={16}
          accessibilityLabel="Create session"
          accessibilityRole="button"
        >
          <Animated.View style={icon}>
            <Plus size={28} color="#fff" strokeWidth={3.5} />
          </Animated.View>
        </PressableScale>
      </Animated.View>
    </View>
  );
}

function CommunitiesHeaderStreak() {
  const theme = useTheme();
  const { streakCount, longestStreak, lastActivityDate, isAtRisk } = useStreak();
  const focused = useIsFocused();
  const [modalVisible, setModalVisible] = useState(false);
  const hasStreak = streakCount > 0;
  const streakColor = hasStreak ? theme.error : theme.textSecondary;
  const activeToday = lastActivityDate === new Date().toISOString().split('T')[0];
  const flameState: FlameState = !hasStreak ? 'cold' : isAtRisk ? 'atRisk' : activeToday ? 'idle' : 'cold';

  return (
    <>
      <PressableScale
        onPress={() => setModalVisible(true)}
        scaleTo={0.94}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          marginLeft: Spacing.md,
          paddingTop: Platform.OS === 'ios' ? 4 : 0,
          gap: 6,
          backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          paddingHorizontal: 10,
          paddingVertical: 5,
          borderRadius: Radius.full,
        })}
        hitSlop={12}
        accessibilityLabel={`${streakCount} day streak`}
        accessibilityRole="button"
      >
        <AnimatedFlame size={22} color={streakColor} state={flameState} count={streakCount} paused={!focused || modalVisible} />
        <AnimatedNumber value={streakCount} style={{ fontSize: 15, fontWeight: '800', color: theme.text }} />
      </PressableScale>

      <StreakModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        streakCount={streakCount}
        longestStreak={longestStreak}
        lastActivityDate={lastActivityDate}
      />
    </>
  );
}

export default function TabLayout() {
  const theme = useTheme();
  const { unreadCount } = useNotifications();
  const chatUnreadCount = useSyncExternalStore(subscribeChatUnreadCount, getChatUnreadCount);
  const insets = useSafeAreaInsets();

  const commonHeaderStyle = {
    backgroundColor: theme.background,
    height: Platform.OS === 'ios' ? 96 : 76,
    elevation: 0,
    shadowOpacity: 0,
  };

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptics.selection() }}
      screenOptions={{
        animation: 'fade',
        sceneStyle: { backgroundColor: theme.background },
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: commonHeaderStyle,
        headerTintColor: theme.text,
        headerTitleAlign: 'center',
        headerTitleStyle: { fontWeight: '800', fontSize: 22, letterSpacing: -0.3 },
        headerTitleContainerStyle: { paddingBottom: Platform.OS === 'ios' ? 4 : 0 },
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopWidth: 0,
          overflow: 'visible',
          elevation: 0,
          shadowOpacity: 0,
          height: Platform.OS === 'ios' ? 92 : 60 + Math.max(insets.bottom, Spacing.md),
          paddingTop: Spacing.sm,
          paddingBottom: Platform.OS === 'ios' ? 22 : Math.max(insets.bottom, Spacing.md),
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.2,
        },
        tabBarShowLabel: true,
        tabBarBackground: () => <TabBarBumpBackground />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Communities',
          tabBarLabel: 'Communities',
          headerTitle: () => <DefaultHeaderTitle title="Communities" />,
          headerLeft: () => <CommunitiesHeaderStreak />,
          headerRight: () => <CommunitiesHeaderProfile />,
          tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused}><Users size={size} color={color} strokeWidth={2.2} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Sessions',
          tabBarLabel: 'Sessions',
          headerTitle: () => <DefaultHeaderTitle title="Sessions" />,
          headerRight: () => <SessionsHeaderRight />,
          headerLeft: () => <CreateSessionButton />,
          tabBarIcon: ({ color, size, focused }) => <TabIcon focused={focused}><CalendarDays size={size} color={color} strokeWidth={2.2} /></TabIcon>,
        }}
      />
      <Tabs.Screen
        name="tournaments"
        options={{
          title: 'Tournaments',
          tabBarLabel: () => null,
          tabBarAccessibilityLabel: 'Tournaments',
          headerTitle: () => <DefaultHeaderTitle title="Tournaments" />,
          tabBarIcon: ({ color, size }) => <Trophy size={size} color={color} strokeWidth={2.2} />,
          tabBarButton: (props) => <TournamentTabBarButton {...props} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarLabel: 'Chats',
          headerTitle: () => <DefaultHeaderTitle title="Chats" />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon focused={focused}>
              <View style={{ position: 'relative', paddingBottom: 2 }}>
                <MessageSquare size={size} color={color} strokeWidth={2.2} />
                <AnimatedBadge
                  count={chatUnreadCount}
                  size={16}
                  color={theme.success}
                  style={{ position: 'absolute', top: -4, right: -6 }}
                />
              </View>
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Activity',
          tabBarLabel: 'Updates',
          headerTitle: () => <DefaultHeaderTitle title="Activity" />,
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon focused={focused}>
              <View style={{ position: 'relative', paddingBottom: 2 }}>
                <Activity size={size} color={color} strokeWidth={2.2} />
                <AnimatedBadge
                  visible={unreadCount > 0}
                  size={10}
                  style={{ position: 'absolute', top: -4, right: -6 }}
                />
              </View>
            </TabIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: () => <DefaultHeaderTitle title="Profile" />,
          href: null,
          tabBarIcon: ({ color, size }) => <ProfileTabIcon color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}