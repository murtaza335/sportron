import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { CheckCheck } from 'lucide-react-native';

import Animated, { FadeIn, FadeInDown, FadeOutRight } from 'react-native-reanimated';
import { AnimatedBadge } from '@/components/motion/AnimatedBadge';
import { TabUnderline, type TabLayout } from '@/components/motion/TabUnderline';
import { NotificationRowSkeleton, SkeletonList } from '@/components/skeletons';
import { haptics } from '@/lib/haptics';
import { Duration, RM, LayoutShift } from '@/lib/motion';
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

const ROW_LAYOUT = LayoutShift;
const ROW_ENTER = FadeInDown.duration(Duration.base).reduceMotion(RM);
const ROW_EXIT = FadeOutRight.duration(Duration.base).reduceMotion(RM);

export default function UpdatesScreen() {
  const theme = useTheme();
  const { notifications, fetchNotifications, loading, markAllAsRead, unreadCount } = useNotifications();
  const [activeTab, setActiveTab] = useState<'action' | 'invites' | 'past'>('action');
  const [markingAll, setMarkingAll] = useState(false);
  const [tabLayouts, setTabLayouts] = useState<(TabLayout | undefined)[]>([]);

  const actionRequired = notifications.filter((n) => ACTION_REQUIRED_TYPES.includes(n.type));
  const invites = notifications.filter((n) => INVITE_TYPES.includes(n.type));
  const pastActivity = notifications.filter(
    (n) => !ACTION_REQUIRED_TYPES.includes(n.type) && !INVITE_TYPES.includes(n.type)
  );
  
  const pastUnreadCount = pastActivity.filter((n) => !n.read).length;
  const tabs = [
    { key: 'action' as const, label: 'Action Required', count: actionRequired.length, color: theme.error, dot: false },
    { key: 'invites' as const, label: 'Invites', count: invites.length, color: theme.info, dot: false },
    { key: 'past' as const, label: 'Past Activity', count: pastUnreadCount, color: theme.info, dot: true },
  ];

  const handleActionComplete = useCallback(
    () => {
      fetchNotifications();
    },
    [fetchNotifications],
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {unreadCount > 0 && (
        <Pressable
          onPress={async () => {
            if (markingAll) return;
            setMarkingAll(true);
            await markAllAsRead();
            setMarkingAll(false);
          }}
          style={({ pressed }) => [styles.markAllButton, pressed && { opacity: 0.6 }]}
          disabled={markingAll}
          hitSlop={8}
        >
          {markingAll ? (
            <ActivityIndicator size="small" color={theme.info} />
          ) : (
            <CheckCheck size={14} color={theme.info} strokeWidth={2.5} />
          )}
          <ThemedText variant="caption" style={{ color: theme.info, fontWeight: '700' }}>
            {markingAll ? 'Marking...' : 'Mark all as read'}
          </ThemedText>
        </Pressable>
      )}
      <View style={[styles.tabRow, { borderBottomColor: theme.border }]}>
        {tabs.map((t, i) => (
          <Pressable
            key={t.key}
            onPress={() => {
              if (activeTab !== t.key) haptics.selection();
              setActiveTab(t.key);
            }}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              setTabLayouts((prev) => {
                const cur = prev[i];
                if (cur && cur.x === x && cur.width === width) return prev;
                const next = [...prev];
                next[i] = { x, width };
                return next;
              });
            }}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
            hitSlop={8}
          >
            <ThemedText
              variant="label"
              numberOfLines={1}
              style={[styles.tabLabel, { color: activeTab === t.key ? theme.text : theme.textSecondary }]}
            >
              {t.label}
            </ThemedText>
            {t.dot ? (
              <AnimatedBadge visible={t.count > 0} size={8} color={theme.info} />
            ) : (
              <AnimatedBadge count={t.count} color={t.color} />
            )}
          </Pressable>
        ))}
        <TabUnderline layouts={tabLayouts} index={Math.max(0, tabs.findIndex((t) => t.key === activeTab))} color={theme.text} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <ThemedRefreshControl refreshing={loading} onRefresh={fetchNotifications} />
        }
      >
        {loading && notifications.length === 0 ? (
          <SkeletonList Item={NotificationRowSkeleton} count={5} style={{ padding: Spacing.md }} />
        ) : (
        <Animated.View key={activeTab} entering={FadeIn.duration(Duration.base).reduceMotion(RM)}>
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
              <Animated.View key={n.id} layout={ROW_LAYOUT} entering={ROW_ENTER} exiting={ROW_EXIT}>
                <ActivityCard notification={n} onComplete={handleActionComplete} />
              </Animated.View>
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
                <Animated.View key={n.id} layout={ROW_LAYOUT} entering={ROW_ENTER} exiting={ROW_EXIT}>
                <InviteCard
                  notificationId={n.id}
                  inviteId={inviteId}
                  communityName={communityName}
                  inviterName={inviterName}
                  createdAt={n.created_at}
                  onComplete={handleActionComplete}
                />
                </Animated.View>
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
              <Animated.View key={n.id} layout={ROW_LAYOUT} entering={ROW_ENTER} exiting={ROW_EXIT}>
                <ActivityCard notification={n} onComplete={handleActionComplete} />
              </Animated.View>
            ))
          )
        )}
        </Animated.View>
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
