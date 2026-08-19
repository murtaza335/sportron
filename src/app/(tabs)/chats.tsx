import { useEffect, useState } from 'react';
import { StyleSheet, ActivityIndicator, FlatList, Image, Pressable, RefreshControl, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquare, ChevronRight, Users } from 'lucide-react-native';

import { CommunityChatPopup } from '@/components/CommunityChatPopup';
import { SessionChatPopup } from '@/components/SessionChatPopup';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityChat } from '@/hooks/useCommunityChat';
import { useSessionChat } from '@/hooks/useSessionChat';
import { useChats } from '@/hooks/useChats';
import { useTheme } from '@/hooks/use-theme';
import type { Community, Session } from '@/types';
import { formatSessionPurpose, SPORT_LABELS } from '@/types';

type ChatTab = 'communities' | 'sessions';

type ChatRow =
  | { kind: 'community'; community: Community; unread: number }
  | { kind: 'session'; session: Session; unread: number };

function formatSessionDate(dateString?: string) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatSessionTime(dateString?: string) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ChatRowCard({ row, onPress }: { row: ChatRow; onPress: () => void }) {
  const theme = useTheme();
  const isCommunity = row.kind === 'community';
  const isSessionActive =
    !isCommunity && (row.session.status === 'open' || row.session.status === 'full');

  const label = isCommunity
    ? row.community.name
    : (row.session.title ?? formatSessionPurpose(row.session.purpose));

  const subtitle = isCommunity
    ? [
        SPORT_LABELS[row.community.sport] ?? row.community.sport,
        `${row.community.member_count ?? 0} members`,
      ].join(' · ')
    : `Session · ${formatSessionDate(row.session.date_time)} ${formatSessionTime(row.session.date_time)}`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        pressed && { backgroundColor: theme.backgroundElement },
      ]}
    >
      {isCommunity && row.community.image_url ? (
        <View style={styles.avatarWrap}>
          <Image source={{ uri: row.community.image_url }} style={styles.avatar} resizeMode="cover" />
        </View>
      ) : (
        <View
          style={[
            styles.avatarWrap,
            styles.avatarPlaceholder,
            { backgroundColor: isSessionActive ? '#10B98120' : theme.backgroundSelected },
          ]}
        >
          {isCommunity ? (
            <Users size={20} color={theme.textSecondary} strokeWidth={2} />
          ) : (
            <MessageSquare
              size={20}
              color={isSessionActive ? '#10B981' : theme.textSecondary}
              strokeWidth={2}
            />
          )}
        </View>
      )}
      <View style={styles.chatInfo}>
        <ThemedText variant="caption" style={styles.chatTitle} numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText variant="caption" muted style={styles.chatSubtitle} numberOfLines={1}>
          {subtitle}
        </ThemedText>
      </View>
      {row.unread > 0 ? (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>{row.unread > 99 ? '99+' : row.unread}</Text>
        </View>
      ) : null}
      <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2.5} />
    </Pressable>
  );
}

export default function ChatsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const {
    communities,
    sessions,
    communityUnread,
    sessionUnread,
    loading,
    refreshing,
    refresh,
    touchLastMessage,
    setChatUnread,
  } = useChats(user?.id);

  const [tab, setTab] = useState<ChatTab>('communities');
  const [openChat, setOpenChat] = useState<ChatRow | null>(null);

  const openCommunityId = openChat?.kind === 'community' ? openChat.community.id : null;
  const openSessionId = openChat?.kind === 'session' ? openChat.session.id : null;

  const communityChat = useCommunityChat(
    openCommunityId,
    user?.id,
    tab === 'communities' && openChat?.kind === 'community',
    profile,
  );

  const sessionChat = useSessionChat(
    openSessionId,
    user?.id,
    tab === 'sessions' && openChat?.kind === 'session',
    profile,
  );

  const isSessionTab = tab === 'sessions';

  const listData: ChatRow[] = isSessionTab
    ? sessions.map((s) => ({ kind: 'session', session: s, unread: sessionUnread[s.id] ?? 0 }))
    : communities.map((c) => ({ kind: 'community', community: c, unread: communityUnread[c.id] ?? 0 }));

  const openChatId = openChat
    ? openChat.kind === 'community'
      ? openChat.community.id
      : openChat.session.id
    : null;

  // The live message list of the chat whose popup is currently open (null when
  // none is open). Used to re-order the hub instantly on return — no refetch.
  const openChatMessages =
    openChat?.kind === 'community'
      ? communityChat.messages
      : openChat?.kind === 'session'
        ? sessionChat.messages
        : null;

  // Whenever the open chat gains a newer message (optimistic send, realtime
  // arrival, or the initial load), bump its "last activity" so it re-sorts to
  // the top immediately. Guarded by the message's own id column so stale
  // messages from a previously opened chat can't bump the wrong chat while the
  // new chat's page is still loading.
  useEffect(() => {
    if (!openChat || !openChatMessages || openChatMessages.length === 0) return;
    const belongs = (m: { session_id?: string; community_id?: string }) =>
      openChat.kind === 'community'
        ? m.community_id === openChatId
        : m.session_id === openChatId;
    const seen = openChatMessages.filter(belongs);
    if (seen.length === 0) return;
    const newest = seen.reduce((a, b) =>
      new Date(a.created_at).getTime() > new Date(b.created_at).getTime() ? a : b,
    );
    touchLastMessage(openChat.kind, openChatId!, newest.created_at);
  }, [openChat, openChatId, openChatMessages, touchLastMessage]);

  // Mirror the open chat thread's live unread count into the hub badge: it
  // clears the moment markRead fires (so the badge is gone on return) and bumps
  // while realtime messages from others land.
  const openChatUnread =
    openChat?.kind === 'community'
      ? communityChat.unreadCount
      : openChat?.kind === 'session'
        ? sessionChat.unreadCount
        : null;

  useEffect(() => {
    if (!openChat || openChatUnread == null) return;
    setChatUnread(openChat.kind, openChatId!, openChatUnread);
  }, [openChat, openChatId, openChatUnread, setChatUnread]);

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <SegmentedControl<ChatTab>
          options={[
            { value: 'communities', label: 'Communities' },
            { value: 'sessions', label: 'Sessions' },
          ]}
          value={tab}
          onChange={setTab}
          compact
        />

        {loading && !refreshing ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(item) =>
              item.kind === 'community' ? `community-${item.community.id}` : `session-${item.session.id}`
            }
            contentContainerStyle={[
              styles.list,
              { paddingBottom: Spacing.xxxl + Math.max(insets.bottom, 56) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.text} />
            }
            ItemSeparatorComponent={() => (
              <View style={[styles.separator, { backgroundColor: theme.border }]} />
            )}
            ListEmptyComponent={
              !refreshing ? (
                <View style={styles.empty}>
                  <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
                    {isSessionTab ? (
                      <MessageSquare size={40} color={theme.textSecondary} strokeWidth={1.5} />
                    ) : (
                      <Users size={40} color={theme.textSecondary} strokeWidth={1.5} />
                    )}
                  </View>
                  <ThemedText variant="body" muted style={styles.emptyText}>
                    {isSessionTab ? 'No session chats yet' : 'No community chats yet'}
                  </ThemedText>
                  <ThemedText variant="caption" muted style={styles.emptySubtext}>
                    {isSessionTab
                      ? 'Join or create a session to chat with the group'
                      : 'Join a community to talk with its members'}
                  </ThemedText>
                </View>
              ) : null
            }
            renderItem={({ item }) => <ChatRowCard row={item} onPress={() => setOpenChat(item)} />}
          />
        )}
      </View>

      <CommunityChatPopup
        communityId={openCommunityId}
        visible={openChat?.kind === 'community'}
        onClose={() => setOpenChat(null)}
        currentUserId={user?.id}
        community={openChat?.kind === 'community' ? openChat.community : undefined}
        chat={communityChat}
      />

      <SessionChatPopup
        sessionId={openSessionId}
        visible={openChat?.kind === 'session'}
        onClose={() => setOpenChat(null)}
        currentUserId={user?.id}
        session={openChat?.kind === 'session' ? openChat.session : undefined}
        canSend={
          openChat?.kind === 'session' &&
          (openChat.session.status === 'open' || openChat.session.status === 'full')
        }
        chat={sessionChat}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  loader: {
    marginTop: Spacing.xxl,
  },
  list: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xxxl,
    flexGrow: 1,
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.sm,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 48 + Spacing.md,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInfo: {
    flex: 1,
    gap: 2,
  },
  chatTitle: {
    fontWeight: '800',
    fontSize: 14,
  },
  chatSubtitle: {
    fontSize: 12,
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  empty: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    maxWidth: 280,
  },
  emptySubtext: {
    textAlign: 'center',
    maxWidth: 280,
  },
});