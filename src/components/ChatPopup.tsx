import { Check, ChevronDown, Clock, MessageCircle, Reply, Send, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { deleteChatPresence, upsertChatPresence } from '@/services/chat';
import type { ChatThread } from '@/hooks/useChat';
import type { ChatMessageBase } from '@/types';

// How often the popup refreshes its presence heartbeat. The edge function's
// PRESENCE_TTL (60s) only covers abrupt app kills, so a ~20s beat is safe.
const PRESENCE_HEARTBEAT_MS = 20_000;

// Auto-pin to the bottom within this distance; start loading older messages
// within this distance of the top.
const BOTTOM_THRESHOLD = 60;
const TOP_LOAD_THRESHOLD = 80;

type ChatPopupProps<T extends ChatMessageBase> = {
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  headerTitle: string;
  headerSubtitle?: string;
  canSend: boolean;
  hasLeft?: boolean;
  chat: ChatThread<T>;
  chatType?: 'session' | 'community';
  chatId?: string | null;
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
  chatType,
  chatId,
}: ChatPopupProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadOlder,
    sendMessage,
    firstUnreadIndex,
    markRead,
  } = chat;

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<T | null>(null);
  const [contextMessage, setContextMessage] = useState<T | null>(null);
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<FlatList<T>>(null);
  const didInitialScrollRef = useRef(false);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkReadRef = useRef(0);
  const atBottomRef = useRef(true);

  // The chat list is INVERTED: newest message at index 0 = the scroll origin
  // (offset 0 = the visual bottom). That makes chats behave natively like
  // WhatsApp/iMessage — prepending OLDER messages grows the content at the top
  // and CANNOT move the viewport, so pagination never flashes or jumps. This
  // list (newest-first) is what the FlatList renders.
  const displayMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [messages],
  );

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

  // Presence heartbeat: while the popup is open, keep our row fresh in
  // chat_presence so the push edge function knows this user is reading the chat
  // and skips pushing them. Cleaned up (row deleted) on close or on signing
  // out; if the app dies abruptly the row goes stale and the TTL kicks in.
  useEffect(() => {
    if (!visible || hasLeft || !chatType || !chatId) return;
    const userId = profile?.id;
    if (!userId) return;

    const heartbeat = () => {
      upsertChatPresence(chatType, chatId, userId).catch((e) =>
        console.error('Failed to update chat presence:', e),
      );
    };
    heartbeat();
    const timer = setInterval(heartbeat, PRESENCE_HEARTBEAT_MS);

    return () => {
      clearInterval(timer);
      deleteChatPresence(chatType, chatId, userId).catch((e) =>
        console.error('Failed to clear chat presence:', e),
      );
    };
  }, [visible, hasLeft, chatType, chatId, profile?.id]);

  // Positions the list exactly once on open. Inverted list → offset 0 IS the
  // bottom, and the list starts there by default, so the "caught up" case needs
  // no scroll at all. Non-animated everywhere so the chat snaps in one frame
  // (the old stutter came from ANIMATED re-following while rows were measuring).
  useEffect(() => {
    if (!visible || loading || !displayMessages.length || didInitialScrollRef.current) return;
    didInitialScrollRef.current = true;

    const target = firstUnreadIndex;
    if (target != null && target >= 0) {
      // Jump to the "New messages" divider. displayMessages is newest-first, so
      // the oldest-unread row sits at index (total - 1 - ascIndex); align it to
      // the top of the screen (viewPosition 1 in an inverted list) so unread
      // messages fill the viewport below the divider.
      const descIndex = Math.max(0, displayMessages.length - 1 - target);
      if (descIndex > 0) {
        try {
          listRef.current?.scrollToIndex({
            index: descIndex,
            viewPosition: 1,
            animated: false,
          });
        } catch {
          // Items not measured yet — onScrollToIndexFailed retries.
        }
      }
      // Parked at the divider: no auto-follow until the user reaches the bottom
      // or sends a message (jump button becomes visible immediately).
      atBottomRef.current = false;
      requestAnimationFrame(() => setAtBottom(false));
    } else {
      // Inverted default is already offset 0 = bottom. Explicitly pin it so a
      // re-open after scrolling elsewhere lands back at the newest message.
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      atBottomRef.current = true;
      requestAnimationFrame(() => setAtBottom(true));
    }

    markRead();
  }, [visible, loading, displayMessages.length, firstUnreadIndex, markRead]);

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

  // Goes to the very bottom (button tap / after sending) and re-enables
  // auto-scroll pinning. In inverted lists offset 0 IS the bottom.
  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => listRef.current?.scrollToOffset({ offset: 0, animated }));
    atBottomRef.current = true;
    setAtBottom(true);
  }, []);

  // Inverted list scrolling:
  // - offset 0 = the visual bottom (newest) — being there means "at bottom".
  // - the visual TOP is the scroll END, so reaching it loads older messages.
  // - Pagination in an inverted list inserts older rows at the top and NEVER
  //   moves the viewport natively — no anchor/shift math needed, no flashes.
  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const isAtBottom = contentOffset.y < BOTTOM_THRESHOLD;
    if (isAtBottom !== atBottomRef.current) {
      atBottomRef.current = isAtBottom;
      setAtBottom(isAtBottom);
    }

    // Reading at the bottom advances the read cursor (debounced).
    if (isAtBottom) handleScrollEndReached();

    // Near the visual top of the list → prefetch older messages.
    const nearTop =
      contentSize.height - layoutMeasurement.height - contentOffset.y < TOP_LOAD_THRESHOLD;
    if (hasMore && !loadingMore && !isAtBottom && nearTop) {
      loadOlder();
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    const reply = replyTo;
    setDraft('');
    setReplyTo(null);
    setSending(true);
    try {
      // useChat.send adds the optimistic bubble + clock SYNCHRONOUSLY before it
      // awaits the DB write, so once this call returns the message is already in
      // the UI. Free the send button immediately instead of waiting for the
      // whole round-trip — the user can type/send the next message right away.
      const promise = sendMessage(text, reply?.id);
      setSending(false);
      await promise;
      // Sending always jumps to the bottom (and clears the divider state).
      scrollToBottom(true);
    } catch (e) {
      setSending(false);
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
    // firstUnreadIndex is an ASCENDING (oldest-first) index; displayMessages is
    // newest-first, so the oldest-unread row maps to (total - 1 - ascIndex).
    const isFirstUnread =
      firstUnreadIndex != null &&
      displayMessages.length - 1 - index === firstUnreadIndex;
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

  const sendDisabled = !canSend || !draft.trim() || sending;

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
                  inverted
                  data={displayMessages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  onScrollToIndexFailed={(info) => {
                    // No getItemLayout (variable-height messages, reply
                    // previews), so an unmeasurable divider jump retries until
                    // the cells are mounted. No offset math — the inverted list
                    // resolves the target itself.
                    let attempts = 0;
                    const retry = () => {
                      if (attempts >= 4) return;
                      attempts += 1;
                      setTimeout(() => {
                        try {
                          listRef.current?.scrollToIndex({
                            index: info.index,
                            viewPosition: 1,
                            animated: false,
                          });
                        } catch {
                          retry();
                        }
                      }, 100);
                    };
                    retry();
                  }}
                />
              )}

              {/* Older-page loading pill. Rendered as an OVERLAY (not a list header) so it
                  never shifts the content layout while old messages load — the
                  inverted list keeps the viewport pinned on its own. */}
              {loadingMore && (
                <View pointerEvents="none" style={styles.loadMoreOverlay}>
                  <View
                    style={[
                      styles.loadMorePill,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <ActivityIndicator size="small" color={theme.textSecondary} />
                  </View>
                </View>
              )}

              {/* Jump-to-bottom button: shown whenever the user is not pinned to
                  the bottom (scrolled up / parked at the "New messages" divider). */}
              {!atBottom && (
                <Pressable
                  onPress={() => {
                    scrollToBottom(true);
                    markRead();
                  }}
                  hitSlop={8}
                  style={[
                    styles.jumpBtn,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                >
                  <ChevronDown size={20} color={theme.text} strokeWidth={2.5} />
                </Pressable>
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
                  // Grey + disabled when the trimmed input is empty and while a
                  // message is in flight (being added to the UI), otherwise green
                  // so the input can be reused for the next message immediately.
                  disabled={sendDisabled}
                  style={({ pressed }) => [
                    styles.sendBtn,
                    {
                      backgroundColor: sendDisabled ? theme.backgroundElement : '#10B981',
                      opacity: pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <Send size={18} color={sendDisabled ? theme.textSecondary : '#FFFFFF'} />
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
  loadMoreOverlay: {
    position: 'absolute',
    top: Spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  loadMorePill: {
    paddingVertical: 8,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.full,
    borderWidth: 1,
    flexDirection: 'row',
  },
  jumpBtn: {
    position: 'absolute',
    left: Spacing.lg,
    bottom: Spacing.md,
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
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
