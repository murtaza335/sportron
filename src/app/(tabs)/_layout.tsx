import { router, Tabs } from 'expo-router';
import { Activity, Clock, Plus, User, Users } from 'lucide-react-native';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';

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
          height: Platform.OS === 'ios' ? 88 : 56 + Math.max(insets.bottom, Spacing.md),
          paddingTop: Spacing.sm,
          paddingBottom: Platform.OS === 'ios' ? 28 : Math.max(insets.bottom, Spacing.md),
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
          title: 'Communities',
          headerTitle: () => <DefaultHeaderTitle title="Communities" />,
          headerLeft: () => (
            <Pressable
              onPress={() => router.navigate('/create-community')}
              style={{ marginLeft: Spacing.md, paddingTop: Platform.OS === 'ios' ? 8 : 0 }}
              hitSlop={12}
              accessibilityLabel="Create community"
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
                <Plus size={18} color={theme.text} strokeWidth={2.5} />
              </View>
            </Pressable>
          ),
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Sessions',
          headerTitle: () => <DefaultHeaderTitle title="Find a Match" />,
          headerLeft: () => (
            <Pressable
              onPress={() => router.navigate('/create-session')}
              style={{ marginLeft: Spacing.md, paddingTop: Platform.OS === 'ios' ? 8 : 0 }}
              hitSlop={12}
              accessibilityLabel="Create session"
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
                <Plus size={18} color={theme.text} strokeWidth={2.5} />
              </View>
            </Pressable>
          ),
          tabBarIcon: ({ color, size }) => <Clock size={size} color={color} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Activity',
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