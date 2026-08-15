import { Check, Clock, MessageCircle, Reply, Send, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import type { ChatThread } from '@/hooks/useChat';
import type { ChatMessageBase } from '@/types';

type ChatPopupProps<T extends ChatMessageBase> = {
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  headerTitle: string;
  headerSubtitle?: string;
  canSend: boolean;
  hasLeft?: boolean;
  chat: ChatThread<T>;
};

function formatMessageTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatPopup<T extends ChatMessageBase>({
  visible,
  onClose,
  currentUserId,
  headerTitle,
  headerSubtitle,
  canSend,
  hasLeft = false,
  chat,
}: ChatPopupProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { messages, loading, sendMessage, firstUnreadIndex, markRead } = chat;

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<T | null>(null);
  const [contextMessage, setContextMessage] = useState<T | null>(null);
  const listRef = useRef<FlatList<T>>(null);
  const didInitialScrollRef = useRef(false);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkReadRef = useRef(0);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [messages],
  );

  // On open, jump to the oldest unread message (or the bottom when caught up),
  // then mark everything read. Subsequent opens reset so it re-evaluates.
  useEffect(() => {
    didInitialScrollRef.current = false;
  }, [visible]);

  useEffect(() => {
    if (!visible || loading || !sortedMessages.length || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;

    const target = firstUnreadIndex;
    if (target != null && target >= 0) {
      try {
        listRef.current?.scrollToIndex({
          index: target,
          viewPosition: 0,
          animated: false,
        });
      } catch {
        // items not measured yet — onScrollToIndexFailed handles the retry
      }
    } else {
      listRef.current?.scrollToEnd({ animated: false });
    }

    markRead();
  }, [visible, loading, sortedMessages.length, firstUnreadIndex, markRead]);

  // Debounced mark-as-read while scrolling: keeps the cursor advancing as new
  // realtime messages land at the bottom while the user keeps reading.
  const handleScrollEndReached = () => {
    const now = Date.now();
    if (now - lastMarkReadRef.current < 1500) return;
    lastMarkReadRef.current = now;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => markRead(), 800);
  };

  useEffect(
    () => () => {
      if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    },
    [],
  );

  const resolveReplyPreview = (item: T): { name: string; content: string } => {
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

  const resolveMessageName = (msg: T): string => {
    if (msg.sender?.username) return msg.sender.username;
    if (msg.sender_id && msg.sender_id === currentUserId) return profile?.username ?? 'You';
    return 'Unknown';
  };

  const scrollToEnd = () => {
    // When opening with unread messages we scroll to the divider instead of
    // pinning to the bottom, so don't auto-pin on layout/content changes.
    if (firstUnreadIndex != null && firstUnreadIndex >= 0) return;
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

  const renderReplyPreview = (item: T, mine: boolean) => {
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

  const renderMessage = ({ item, index }: { item: T; index: number }) => {
    const mine = item.sender_id === currentUserId;
    const isSending = item.status === 'sending';
    const isFirstUnread = firstUnreadIndex != null && index === firstUnreadIndex;
    return (
      <View>
        {isFirstUnread && (
          <View style={styles.unreadDivider}>
            <View style={[styles.unreadDividerLine, { backgroundColor: theme.border }]} />
            <ThemedText variant="caption" style={[styles.unreadDividerText, { color: '#10B981' }]}>
              New messages
            </ThemedText>
            <View style={[styles.unreadDividerLine, { backgroundColor: theme.border }]} />
          </View>
        )}
        <Pressable
          onLongPress={() => setContextMessage(item)}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.msgRow,
            mine ? styles.msgRowMine : styles.msgRowOther,
            pressed && { opacity: 0.85 },
          ]}
        >
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
        </Pressable>
      </View>
    );
  };

  const placeholder = hasLeft
    ? 'You are no longer in this chat'
    : canSend
      ? 'Type a message...'
      : 'Chat is unavailable';

  return (
    <>
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
                {headerTitle}
              </ThemedText>
              {headerSubtitle ? (
                <ThemedText variant="caption" muted numberOfLines={1}>
                  {headerSubtitle}
                </ThemedText>
              ) : null}
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
                    You left this chat so you will not receive any further messages
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
                  onEndReached={handleScrollEndReached}
                  onEndReachedThreshold={0.3}
                  onScrollToIndexFailed={(info) => {
                    if (info.index === 0) {
                      listRef.current?.scrollToEnd({ animated: false });
                    } else {
                      listRef.current?.scrollToIndex({
                        index: Math.max(0, info.index - 1),
                        viewPosition: 0,
                        animated: false,
                      });
                    }
                  }}
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
                  placeholder={placeholder}
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

      {/* Long-press context menu */}
      <Modal
        transparent
        visible={!!contextMessage}
        animationType="fade"
        onRequestClose={() => setContextMessage(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setContextMessage(null)}>
          <Pressable
            style={[
              styles.contextSheet,
              { backgroundColor: theme.background, borderColor: theme.border },
            ]}
          >
            <Pressable
              style={[styles.contextOption, { borderBottomColor: theme.border }]}
              onPress={() => {
                if (contextMessage) setReplyTo(contextMessage);
                setContextMessage(null);
              }}
            >
              <View style={styles.contextOptionRow}>
                <Reply size={18} color="#10B981" strokeWidth={2.5} />
                <ThemedText variant="body" style={[styles.contextOptionText, { color: '#10B981', fontWeight: '600' }]}>
                  Reply
                </ThemedText>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  unreadDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.md,
  },
  unreadDividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  unreadDividerText: {
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  contextSheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : Spacing.lg,
    gap: Spacing.sm,
  },
  contextOption: {
    paddingVertical: Spacing.md,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  contextOptionText: {
    fontSize: 15,
  },
});
