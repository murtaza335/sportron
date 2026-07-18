import { Bell } from 'lucide-react-native';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { NotificationItem } from '@/components/NotificationItem';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationsScreen() {
  const theme = useTheme();
  const { notifications, unreadCount, fetchNotifications, markAsRead, markAllAsRead, deleteNotification, loading } = useNotifications();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: 'transparent' }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchNotifications} tintColor={theme.text} />
        }
      >
        {unreadCount > 0 && (
          <Pressable onPress={markAllAsRead} style={styles.markAllBtn} hitSlop={8}>
            <ThemedText variant="caption" style={{ color: theme.text, fontWeight: '700' }}>
              Mark all as read
            </ThemedText>
          </Pressable>
        )}

        {!loading && notifications.length === 0 ? (
          <View style={styles.empty}>
            <Bell size={48} color={theme.textSecondary} />
            <ThemedText variant="body" muted style={styles.emptyText}>
              No notifications yet
            </ThemedText>
            <ThemedText variant="caption" muted style={styles.emptySubtext}>
              You&apos;ll see match updates, likes, and comments here
            </ThemedText>
          </View>
        ) : (
          notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onPress={() => markAsRead(notification.id)}
              onMarkRead={markAsRead}
              onDismiss={deleteNotification}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: Spacing.xl,
  },
  markAllBtn: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    alignItems: 'flex-end',
  },
  empty: {
    paddingVertical: Spacing.xxxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyText: {
    fontWeight: '600',
    fontSize: 16,
  },
  emptySubtext: {
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
});
