import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';
import { formatRelativeTime } from '@/lib/date';
import { NotificationIcon } from './NotificationIcon';

interface NotificationItemProps {
  notification: ReturnType<typeof useNotifications>['notifications'][number];
  onPress: () => void;
  onMarkRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

export function NotificationItem({ notification, onPress, onDismiss }: NotificationItemProps) {
  const theme = useTheme();

  const isDark = theme.resolvedColorScheme === 'dark';
  const unreadBg = isDark ? 'rgba(59, 130, 246, 0.1)' : '#F8FAFF';
  const pressedBg = isDark ? '#1A1A1A' : '#FAFAFA';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          backgroundColor: pressed
            ? pressedBg
            : notification.read
              ? theme.background
              : unreadBg,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: 'row' as const,
          alignItems: 'center' as const,
        })}
        hitSlop={8}
      >
        <View style={styles.content}>
          <NotificationIcon type={notification.type} />
          <View style={styles.textContainer}>
            <ThemedText variant="label" style={styles.title} numberOfLines={1}>
              {notification.title}
            </ThemedText>
            <ThemedText variant="caption" muted style={styles.body} numberOfLines={2}>
              {notification.body}
            </ThemedText>
            <ThemedText variant="caption" muted style={styles.time}>
              {formatRelativeTime(notification.created_at)}
            </ThemedText>
          </View>
        </View>

        {!notification.read && (
          <View style={styles.unreadIndicator} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingRight: 8,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  time: {
    fontSize: 11,
    marginTop: 2,
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
    marginTop: 6,
  },
});
