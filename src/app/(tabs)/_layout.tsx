import { router, Tabs } from 'expo-router';
import { CalendarDays, Activity, Flame, History, MessageSquare, Plus, Users, X } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSyncExternalStore } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
      style={{ marginRight: Spacing.md, paddingTop: Platform.OS === 'ios' ? 8 : 0 }}
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
    <Pressable
      onPress={() => router.navigate('/profile')}
      style={{ marginRight: Spacing.md, paddingTop: Platform.OS === 'ios' ? 4 : 0 }}
      hitSlop={12}
      accessibilityLabel="Open profile"
      accessibilityRole="button"
    >
      <UserAvatar avatarUrl={profile?.avatar_url} size={34} />
    </Pressable>
  );
}

function CommunitiesHeaderStreak() {
  const theme = useTheme();
  const { streakCount } = useStreak();
  const hasStreak = streakCount > 0;
  const streakColor = hasStreak ? '#FF5722' : theme.textSecondary;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 4 : 0,
        gap: 6,
        backgroundColor: theme.backgroundElement,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: Radius.full,
      }}
      accessibilityLabel={`${streakCount} day streak`}
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
    </View>
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
          headerLeft: () => (
            <Pressable
              onPress={() => router.navigate('/create-session')}
              style={{ marginLeft: Spacing.md, paddingTop: Platform.OS === 'ios' ? 4 : 0 }}
              hitSlop={16}
              accessibilityLabel="Create session"
              accessibilityRole="button"
            >
              <Plus size={24} color={theme.text} strokeWidth={3} />
            </Pressable>
          ),
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
                  backgroundColor: '#10B981',
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
                  backgroundColor: '#DC2626',
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
        }}
      />
    </Tabs>
  );
}