import { router, Tabs } from 'expo-router';
import { CalendarDays, Activity, Flame, History, MessageSquare, Plus, Users, X, User } from 'lucide-react-native';
import { Animated, ColorValue, Easing, Platform, Pressable, Text, View } from 'react-native';
import { useRef, useState, useSyncExternalStore, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StreakModal } from '@/components/StreakModal';
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
      {showDot && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: theme.error,
            borderWidth: 2,
            borderColor: theme.background,
          }}
        />
      )}
    </View>
  );
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
  const scaleAnim = useRef(new Animated.Value(1));

  const handlePressIn = () => {
    Animated.spring(scaleAnim.current, {
      toValue: 0.9,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim.current, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={() => router.navigate('/profile')}
      style={{ marginRight: Spacing.md, paddingTop: Platform.OS === 'ios' ? 4 : 0 }}
      hitSlop={12}
      accessibilityLabel="Open profile"
      accessibilityRole="button"
    >
      {/* eslint-disable-next-line react-hooks/refs */}
      <Animated.View style={{ transform: [{ scale: scaleAnim.current }] }}>
        <UserAvatar avatarUrl={profile?.avatar_url} size={34} />
      </Animated.View>
    </Pressable>
  );
}

function CreateSessionButton() {
  const pulseAnim = useRef(new Animated.Value(0));
  const glowAnim = useRef(new Animated.Value(0));
  const scaleAnim = useRef(new Animated.Value(1));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim.current, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim.current, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim.current, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim.current, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, []);

  const handlePressIn = () => {
    Animated.spring(scaleAnim.current, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim.current, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  return (
    <View>
      <Animated.View
        style={{
          shadowColor: '#10B981',
          shadowOffset: { width: 0, height: 0 },
          // eslint-disable-next-line react-hooks/refs
          shadowOpacity: glowAnim.current.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 0.6],
          }),
          // eslint-disable-next-line react-hooks/refs
          shadowRadius: glowAnim.current.interpolate({
            inputRange: [0, 1],
            outputRange: [8, 16],
          }),
          elevation: 8,
        }}
      >
        <Pressable
          onPress={() => router.navigate('/create-session')}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={({ pressed }) => [
            {
              marginLeft: Spacing.md,
              paddingTop: Platform.OS === 'ios' ? 4 : 0,
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: '#10B981',
              alignItems: 'center',
              justifyContent: 'center',
            },
            pressed && { opacity: 0.9 },
          ]}
          hitSlop={16}
          accessibilityLabel="Create session"
          accessibilityRole="button"
        >
          <Animated.View
            style={{
              transform: [
                // eslint-disable-next-line react-hooks/refs
                { scale: scaleAnim.current },
                {
                  // eslint-disable-next-line react-hooks/refs
                  scale: pulseAnim.current.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.08],
                  }),
                },
              ],
            }}
          >
            <Plus size={28} color="#fff" strokeWidth={3.5} />
          </Animated.View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function CommunitiesHeaderStreak() {
  const theme = useTheme();
  const { streakCount, longestStreak, lastActivityDate } = useStreak();
  const [modalVisible, setModalVisible] = useState(false);
  const hasStreak = streakCount > 0;
  const streakColor = hasStreak ? theme.error : theme.textSecondary;

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
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
          transform: pressed ? [{ scale: 0.96 }] : [],
        })}
        hitSlop={12}
        accessibilityLabel={`${streakCount} day streak`}
        accessibilityRole="button"
      >
        <Flame
          size={22}
          color={streakColor}
          fill={streakColor}
          strokeWidth={0}
        />
        <Text style={{ fontSize: 15, fontWeight: '800', color: theme.text }}>
          {streakCount}
        </Text>
      </Pressable>

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
      screenOptions={{
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
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} strokeWidth={2.2} />,
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
          tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarLabel: 'Chats',
          headerTitle: () => <DefaultHeaderTitle title="Chats" />,
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: 'relative', paddingBottom: 2 }}>
              <MessageSquare size={size} color={color} strokeWidth={2.2} />
              {chatUnreadCount > 0 && (
                <View style={{
                  position: 'absolute',
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  borderRadius: 8,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                   backgroundColor: theme.success,
                }}>
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
                    {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Activity',
          tabBarLabel: 'Updates',
          headerTitle: () => <DefaultHeaderTitle title="Activity" />,
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: 'relative', paddingBottom: 2 }}>
              <Activity size={size} color={color} strokeWidth={2.2} />
              {unreadCount > 0 && (
                <View style={{
                  position: 'absolute',
                  top: -4,
                  right: -6,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                   backgroundColor: theme.error,
                }} />
              )}
            </View>
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