import { router, Tabs } from 'expo-router';
import { Bell, Clock, Home, User } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';

function HomeHeaderTitle() {
  const { profile } = useAuth();
  const theme = useTheme();

  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, opacity: 0.7 }}>
        Welcome back
      </Text>
      <Text style={{ fontSize: 22, fontWeight: '800', color: theme.text, letterSpacing: -0.3 }}>
        {profile?.username ?? 'Player'}
      </Text>
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

export default function TabLayout() {
  const theme = useTheme();
  const { unreadCount } = useNotifications();

  const commonHeaderStyle = {
    backgroundColor: theme.background,
    height: Platform.OS === 'ios' ? 96 : 76,
    // Note: elevation and shadowOpacity here are usually overridden by headerShadowVisible, 
    // but we can add them as an extra safety measure for older Android versions
    elevation: 0, 
    shadowOpacity: 0,
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false, // <-- ADD THIS to completely remove the header border/shadow
        headerStyle: commonHeaderStyle,
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '800', fontSize: 22, letterSpacing: -0.3 },
        headerTitleContainerStyle: { paddingBottom: Platform.OS === 'ios' ? 4 : 0 },
        headerRight: () => (
          <Pressable
            onPress={() => router.navigate('/notifications')}
            style={{ marginRight: Spacing.md, position: 'relative', paddingTop: Platform.OS === 'ios' ? 8 : 0 }}
            hitSlop={12}
          >
            <Bell size={22} color={theme.text} strokeWidth={2.2} />
            {unreadCount > 0 && (
              <View style={{
                position: 'absolute',
                top: Platform.OS === 'ios' ? 4 : -4,
                right: -6,
                minWidth: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: '#DC2626',
                alignItems: 'center',
                justifyContent: 'center',
                paddingHorizontal: 4,
              }}>
                <Text style={{ color: 'white', fontSize: 10, fontWeight: '700', lineHeight: 12 }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        ),
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: Platform.OS === 'ios' ? 88 : 72,
          paddingTop: Spacing.sm,
          paddingBottom: Platform.OS === 'ios' ? 28 : Spacing.md,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.2,
        },
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerTitle: () => <HomeHeaderTitle />,
          tabBarIcon: ({ color, size }) => <Home size={size + 2} color={color} strokeWidth={2.4} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          headerTitle: () => <DefaultHeaderTitle title="History" />,
          tabBarIcon: ({ color, size }) => <Clock size={size} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: () => <DefaultHeaderTitle title="Profile" />,
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: 'relative', paddingBottom: 2 }}>
              <User size={28} color={color} strokeWidth={2.2} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}