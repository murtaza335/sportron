import { Bell } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';

interface NotificationBellProps {
  unreadCount: number;
  onPress: () => void;
}

export function NotificationBell({ unreadCount, onPress }: NotificationBellProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.container}>
      <View style={styles.bellWrapper}>
        <Bell size={24} color={theme.text} strokeWidth={2.5} />
        {unreadCount > 0 && (
          <View style={[styles.badge, { backgroundColor: theme.text }]}>
            <ThemedText variant="caption" style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </ThemedText>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
  },
  bellWrapper: {
    position: 'relative',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
  },
});