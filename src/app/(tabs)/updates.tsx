import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { CheckCheck } from 'lucide-react-native';

import { ActivityCard } from '@/components/ActivityCard';
import { InviteCard } from '@/components/InviteCard';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNotifications } from '@/hooks/useNotifications';
import type { NotificationType } from '@/types';

const ACTION_REQUIRED_TYPES: NotificationType[] = [
  'session_application',
  'join_request',
  'community_match_pending',
];

const INVITE_TYPES: NotificationType[] = [
  'community_invite',
];

export default function UpdatesScreen() {
  const theme = useTheme();
  const { notifications, fetchNotifications, loading, markAllAsRead, unreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState<'action' | 'invites' | 'past'>('action');

  const actionRequired = notifications.filter((n) => ACTION_REQUIRED_TYPES.includes(n.type));
  const invites = notifications.filter((n) => INVITE_TYPES.includes(n.type));
  const pastActivity = notifications.filter(
    (n) => !ACTION_REQUIRED_TYPES.includes(n.type) && !INVITE_TYPES.includes(n.type)
  );
  
  const pastUnreadCount = pastActivity.filter((n) => !n.read).length;

  const handleActionComplete = useCallback(
    () => {
      fetchNotifications();
    },
    [fetchNotifications],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {unreadCount > 0 && (
        <Pressable onPress={markAllAsRead} style={styles.markAllButton} hitSlop={8}>
          <CheckCheck size={14} color={theme.info} strokeWidth={2.5} />
          <ThemedText variant="caption" style={{ color: theme.info, fontWeight: '700' }}>
            Mark all as read
          </ThemedText>
        </Pressable>
      )}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => setActiveTab('action')}
          style={[
            styles.tab,
            activeTab === 'action' && { borderBottomColor: theme.text },
          ]}
          hitSlop={8}
        >
          <ThemedText
            variant="label"
            numberOfLines={1}
            style={[
              styles.tabLabel,
              { color: activeTab === 'action' ? theme.text : theme.textSecondary },
            ]}
          >
            Action Required
          </ThemedText>
          {actionRequired.length > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.error }]}>
              <ThemedText style={styles.badgeText}>
                {actionRequired.length > 99 ? '99+' : actionRequired.length}
              </ThemedText>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('invites')}
          style={[
            styles.tab,
            activeTab === 'invites' && { borderBottomColor: theme.text },
          ]}
          hitSlop={8}
        >
          <ThemedText
            variant="label"
            numberOfLines={1}
            style={[
              styles.tabLabel,
              { color: activeTab === 'invites' ? theme.text : theme.textSecondary },
            ]}
          >
            Invites
          </ThemedText>
          {invites.length > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.info }]}>
              <ThemedText style={styles.badgeText}>
                {invites.length > 99 ? '99+' : invites.length}
              </ThemedText>
            </View>
          )}
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('past')}
          style={[
            styles.tab,
            activeTab === 'past' && { borderBottomColor: theme.text },
          ]}
          hitSlop={8}
        >
          <ThemedText
            variant="label"
            numberOfLines={1}
            style={[
              styles.tabLabel,
              { color: activeTab === 'past' ? theme.text : theme.textSecondary },
            ]}
          >
            Past Activity
          </ThemedText>
          {pastUnreadCount > 0 && (
            <View style={[styles.badgeDot, { backgroundColor: theme.info }]} />
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchNotifications} tintColor={theme.text} />
        }
      >
        {activeTab === 'action' ? (
          actionRequired.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText variant="body" muted style={{ fontWeight: '600' }}>
                No pending actions
              </ThemedText>
              <ThemedText variant="caption" muted style={{ textAlign: 'center', paddingHorizontal: Spacing.lg }}>
                When someone requests to join your session or community, you&apos;ll see it here
              </ThemedText>
            </View>
          ) : (
            actionRequired.map((n) => (
              <ActivityCard key={n.id} notification={n} onComplete={handleActionComplete} />
            ))
          )
        ) : activeTab === 'invites' ? (
          invites.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText variant="body" muted style={{ fontWeight: '600' }}>
                No pending invites
              </ThemedText>
              <ThemedText variant="caption" muted style={{ textAlign: 'center', paddingHorizontal: Spacing.lg }}>
                When a community admin invites you, it will appear here
              </ThemedText>
            </View>
          ) : (
            invites.map((n) => {
              const body = n.body || '';
              const separator = ' invited you to join ';
              const idx = body.indexOf(separator);
              const inviterName = idx !== -1 ? body.slice(0, idx) : 'Someone';
              const communityName = idx !== -1 ? body.slice(idx + separator.length) : 'Community';
              const inviteId = (n.data?.inviteId as string) || '';
              return (
                <InviteCard
                  key={n.id}
                  notificationId={n.id}
                  inviteId={inviteId}
                  communityName={communityName}
                  inviterName={inviterName}
                  createdAt={n.created_at}
                  onComplete={handleActionComplete}
                />
              );
            })
          )
        ) : (
          pastActivity.length === 0 ? (
            <View style={styles.empty}>
              <ThemedText variant="body" muted style={{ fontWeight: '600' }}>
                No past activity
              </ThemedText>
              <ThemedText variant="caption" muted style={{ textAlign: 'center', paddingHorizontal: Spacing.lg }}>
                Your past notifications and updates will show up here
              </ThemedText>
            </View>
          ) : (
            pastActivity.map((n) => (
              <ActivityCard key={n.id} notification={n} onComplete={handleActionComplete} />
            ))
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.md,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabLabel: {
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.25,
    textTransform: 'none',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 14,
  },
  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  content: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: Spacing.xl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxxl,
  },
});
