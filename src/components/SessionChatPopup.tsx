import { Check, Clock, MessageCircle, Reply, Send, X } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useSessionChat } from '@/hooks/useSessionChat';
import type { Session, SessionChatMessage } from '@/types';

type SessionChatPopupProps = {
  sessionId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  session?: Partial<Session> | null;
  canSend: boolean;
  hasLeft?: boolean;
};

function formatSessionDate(dateString?: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
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

function formatMessageTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Swipe a message to the right to reply to it (WhatsApp style).
function SwipeableMessage({
  onReply,
  children,
}: {
  onReply: () => void;
  children: ReactNode;
}) {
  const [translateX] = useState(() => new Animated.Value(0));

  const reset = () => {
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 7 }).start();
  };

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_e, g) => translateX.setValue(Math.min(g.dx, 72)),
      onPanResponderRelease: (_e, g) => {
        if (g.dx > 60) onReply();
        reset();
      },
      onPanResponderTerminate: reset,
    }),
  );

  return (
    <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
      {children}
    </Animated.View>
  );
}

export function SessionChatPopup({
  sessionId,
  visible,
  onClose,
  currentUserId,
  session,
  canSend,
  hasLeft = false,
}: SessionChatPopupProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { messages, loading, sendMessage } = useSessionChat(
    sessionId,
    currentUserId,
    !hasLeft,
    profile,
  );

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<SessionChatMessage | null>(null);
  const listRef = useRef<FlatList<SessionChatMessage>>(null);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages],
  );

  const resolveReplyPreview = (item: SessionChatMessage): { name: string; content: string } => {
    const targetId = item.reply_to?.id ?? item.reply_to_id ?? null;
    const target = targetId ? sortedMessages.find((m) => m.id === targetId) : null;
    const sender = item.reply_to?.sender ?? target?.sender ?? null;
    const senderId = item.reply_to?.sender_id ?? target?.sender_id ?? null;
    let name = sender?.username ?? null;
    if (!name && senderId && senderId === currentUserId) name = profile?.username ?? 'You';
    return {
      name: name ?? 'Unknown',
      content: (item.reply_to?.content || target?.content || '').trim(),
    };
  };

  const resolveMessageName = (msg: SessionChatMessage): string => {
    if (msg.sender?.username) return msg.sender.username;
    if (msg.sender_id && msg.sender_id === currentUserId) return profile?.username ?? 'You';
    return 'Unknown';
  };

  const scrollToEnd = () => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    const reply = replyTo;
    setDraft('');
    setReplyTo(null);
    try {
      await sendMessage(text, reply?.id);
    } catch (e) {
      setDraft(text);
      if (reply) setReplyTo(reply);
      console.error('Failed to send message:', e);
    }
  };

  const renderReplyPreview = (item: SessionChatMessage, mine: boolean) => {
    if (!item.reply_to && !item.reply_to_id) return null;
    const preview = resolveReplyPreview(item);
    if (!preview.content) return null;
    return (
      <View
        style={[
          styles.replyBlock,
          {
            borderLeftColor: mine ? 'rgba(255,255,255,0.7)' : theme.border,
          },
        ]}
      >
        <ThemedText
          variant="caption"
          numberOfLines={1}
          style={[
            styles.replyName,
            { color: mine ? 'rgba(255,255,255,0.9)' : theme.textSecondary },
          ]}
        >
          {preview.name}
        </ThemedText>
        <ThemedText
          variant="caption"
          numberOfLines={1}
          style={[styles.replyContent, { color: mine ? 'rgba(255,255,255,0.8)' : theme.textSecondary }]}
        >
          {preview.content}
        </ThemedText>
      </View>
    );
  };

  const renderMessage = ({ item }: { item: SessionChatMessage }) => {
    const mine = item.sender_id === currentUserId;
    const isSending = item.status === 'sending';
    return (
      <SwipeableMessage onReply={() => setReplyTo(item)}>
        <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowOther]}>
          {!mine && (
            <UserAvatar avatarUrl={item.sender?.avatar_url} size={30} style={styles.msgAvatar} />
          )}
          <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
            {!mine && (
              <ThemedText variant="caption" muted style={styles.senderName}>
                {item.sender?.username ?? 'Unknown'}
              </ThemedText>
            )}
            <View
              style={[
                styles.bubble,
                mine
                  ? { backgroundColor: '#10B981' }
                  : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              {renderReplyPreview(item, mine)}
              <ThemedText
                variant="body"
                style={[styles.bubbleText, mine ? { color: '#FFFFFF' } : null]}
              >
                {item.content}
              </ThemedText>
            </View>
            <View style={[styles.msgMeta, mine ? styles.msgMetaMine : styles.msgMetaOther]}>
              {mine && (
                <View style={styles.msgStatus}>
                  {isSending ? (
                    <Clock size={12} color={theme.textSecondary} strokeWidth={2.5} />
                  ) : (
                    <Check size={12} color={theme.textSecondary} strokeWidth={2.5} />
                  )}
                </View>
              )}
              <ThemedText variant="caption" muted style={styles.msgTime}>
                {formatMessageTime(item.created_at)}
              </ThemedText>
            </View>
          </View>
          {mine && (
            <UserAvatar avatarUrl={profile?.avatar_url ?? null} size={30} style={styles.msgAvatar} />
          )}
        </View>
      </SwipeableMessage>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <View
          style={[
            styles.header,
            {
              borderBottomColor: theme.border,
              paddingTop: Platform.OS === 'android' ? insets.top : insets.top + Spacing.sm,
            },
          ]}
        >
          <View style={styles.headerInfo}>
            <ThemedText variant="heading" numberOfLines={1} style={styles.headerTitle}>
              {session?.title ?? session?.purpose ?? 'Session'} Chat
            </ThemedText>
            <ThemedText variant="caption" muted numberOfLines={1}>
              {session?.location ?? ''}
              {session?.date_time
                ? ` · ${formatSessionDate(session.date_time)} ${formatSessionTime(session.date_time)}`
                : ''}
              {session?.commitment_count != null ? ` · ${session.commitment_count}/${session.max_participants}` : ''}
            </ThemedText>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={[styles.closeBtn, { backgroundColor: theme.backgroundElement }]}
          >
            <X size={18} color={theme.text} strokeWidth={2.5} />
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
          style={styles.keyboardAvoiding}
        >
          <View style={styles.contentWrapper}>
            {hasLeft && (
              <View
                style={[
                  styles.leftBanner,
                  { backgroundColor: '#A855F715', borderColor: '#A855F730' },
                ]}
              >
                <ThemedText
                  variant="caption"
                  style={{ color: '#A855F7', textAlign: 'center', fontWeight: '600' }}
                >
                  You left the session so you will not receive any further msgs in this chat
                </ThemedText>
              </View>
            )}

            {loading ? (
              <View style={styles.loader}>
                <ActivityIndicator color={theme.text} />
              </View>
            ) : messages.length === 0 ? (
              <View style={styles.empty}>
                <MessageCircle size={44} color={theme.textSecondary} strokeWidth={1.5} />
                <ThemedText variant="body" muted style={styles.emptyText}>
                  No messages yet — say hi to the group!
                </ThemedText>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={sortedMessages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={scrollToEnd}
                onLayout={scrollToEnd}
              />
            )}
          </View>

          <View
            style={[
              styles.inputBar,
              {
                backgroundColor: theme.background,
                borderTopColor: theme.border,
                paddingBottom: Math.max(insets.bottom, Spacing.sm),
              },
            ]}
          >
            {replyTo && (
              <View
                style={[
                  styles.replyBar,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <Reply size={14} color="#10B981" strokeWidth={2.5} />
                <View style={styles.replyBarText}>
                  <ThemedText variant="caption" numberOfLines={1} style={[styles.replyBarName, { color: '#10B981' }]}>
                    Replying to {resolveMessageName(replyTo)}
                  </ThemedText>
                  <ThemedText variant="caption" muted numberOfLines={1}>
                    {replyTo.content}
                  </ThemedText>
                </View>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
                  <X size={16} color={theme.textSecondary} strokeWidth={2.5} />
                </Pressable>
              </View>
            )}

            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={
                  hasLeft
                    ? 'You are no longer in this chat'
                    : canSend
                      ? 'Type a message...'
                      : 'This session is closed'
                }
                placeholderTextColor={theme.textSecondary}
                editable={canSend}
                multiline
                maxLength={1000}
                style={[
                  styles.input,
                  {
                    color: theme.text,
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.border,
                  },
                ]}
              />
              <Pressable
                onPress={handleSend}
                disabled={!canSend || !draft.trim()}
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor:
                      !canSend || !draft.trim() ? theme.backgroundElement : '#10B981',
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <Send size={18} color={!canSend || !draft.trim() ? theme.textSecondary : '#FFFFFF'} />
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  keyboardAvoiding: {
    flex: 1,
  },
  contentWrapper: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerInfo: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leftBanner: {
    borderWidth: 1,
    borderRadius: Radius.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  msgRowMine: {
    justifyContent: 'flex-end',
  },
  msgRowOther: {
    justifyContent: 'flex-start',
  },
  msgAvatar: {
    marginBottom: 18,
  },
  bubbleWrap: {
    maxWidth: '78%',
    gap: 2,
  },
  bubbleWrapMine: {
    alignItems: 'flex-end',
  },
  senderName: {
    marginLeft: 4,
    fontWeight: '600',
    fontSize: 11,
  },
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  replyBlock: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.sm,
    marginBottom: 4,
    gap: 1,
  },
  replyName: {
    fontWeight: '700',
    fontSize: 11,
  },
  replyContent: {
    fontSize: 12,
  },
  msgMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
    paddingHorizontal: 4,
  },
  msgMetaMine: {
    alignSelf: 'flex-end',
  },
  msgMetaOther: {
    alignSelf: 'flex-start',
  },
  msgStatus: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgTime: {
    fontSize: 10,
    marginLeft: 1,
  },
  inputBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.sm,
  },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  replyBarText: {
    flex: 1,
    gap: 1,
  },
  replyBarName: {
    fontWeight: '700',
    fontSize: 11,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 15,
    textAlignVertical: 'center',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
