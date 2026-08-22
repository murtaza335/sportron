import { BlurView } from 'expo-blur';
import {
  AlertTriangle,
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  MessageCircle,
  Pencil,
  RefreshCw,
  Reply,
  Send,
  Trash2,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  GestureResponderEvent,
  KeyboardAvoidingView,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  Dimensions,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAX_BUBBLE_WIDTH = Math.floor(SCREEN_WIDTH * 0.8);
const TOP_LOAD_THRESHOLD = 80;

// Long-press context menu (iPhone-style), anchored to the touch point.
const CONTEXT_CARD_W = 170;
const CONTEXT_OPTION_H = 52;

// Two taps within this window count as a double-tap that opens the same
// options popup as a long-press.
const DOUBLE_TAP_MS = 300;

// Own-message edit/delete windows (mirrors the DB/enforced server-side). The
// client checks with a small grace so a borderline query doesn't show an option
// that the server then rejects; the server stays authoritative.
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_WINDOW_MS = 24 * 60 * 60 * 1000;
const WINDOW_GRACE_MS = 5 * 1000;

function isWithinWindow(createdAt: string, windowMs: number): boolean {
  return Date.now() - new Date(createdAt).getTime() <= windowMs + WINDOW_GRACE_MS;
}

// Only optimistic bubbles carry a status; realtime/fetched rows have none until
// a send marks them. "Delivered" = everything that isn't still sending or failed.
function isDeliveredMessage<T extends { status?: string }>(m: T): boolean {
  return m.status !== 'sending' && m.status !== 'failed';
}

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
    resendMessage,
    deleteMessage,
    editMessage,
    firstUnreadIndex,
    markRead,
  } = chat;

  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const inputRef = useRef<TextInput>(null);
  const [replyTo, setReplyTo] = useState<T | null>(null);
  const [editingMessage, setEditingMessage] = useState<T | null>(null);
  const [contextMenu, setContextMenu] = useState<{ message: T; x: number; y: number } | null>(null);
  const [failedMenu, setFailedMenu] = useState<T | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<T | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const listRef = useRef<FlatList<T>>(null);
  const windowWidth = Dimensions.get('window').width;
  const didInitialScrollRef = useRef(false);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkReadRef = useRef(0);
  const atBottomRef = useRef(true);
  const lastPressRef = useRef(0);

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

  // On close, drop any in-flight edit/reply/delete state so a reopen (possibly
  // for a different chat) starts clean. Deferred a tick to avoid the
  // set-state-in-effect cascade; invisible to users either way.
  useEffect(() => {
    if (visible) return;
    const timer = setTimeout(() => {
      setEditingMessage(null);
      setReplyTo(null);
      setDeleteConfirm(null);
      setActionError(null);
      setFailedMenu(null);
      setContextMenu(null);
    }, 0);
    return () => clearTimeout(timer);
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

  // Long-press captures the touch position so the floating context menu can
  // anchor near the finger instead of sliding up a bottom sheet (which would
  // dismiss the keyboard).
  const handleLongPress = useCallback((item: T, e: GestureResponderEvent) => {
    setContextMenu({ message: item, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
  }, []);

  // Double-tap opens the same options popup (convenience on top of long-press).
  // Works with the keyboard open thanks to `keyboardShouldPersistTaps="handled"`
  // on the list, which delivers taps to the bubbles instead of eating the first
  // tap to dismiss the keyboard.
  const handleMessagePress = useCallback((item: T, e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastPressRef.current < DOUBLE_TAP_MS) {
      lastPressRef.current = 0;
      setContextMenu({ message: item, x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
    } else {
      lastPressRef.current = now;
    }
  }, []);

  const replyToContextMessage = useCallback(() => {
    if (!contextMenu) return;
    setReplyTo(contextMenu.message);
    setContextMenu(null);
    setEditingMessage(null);
    if (canSend) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [contextMenu, canSend]);

  // Starts editing a message: pre-fills the (uncontrolled) input via
  // setNativeProps so the edit bar + bubble are in sync without switching to a
  // controlled TextInput.
  const startEditing = useCallback(() => {
    if (!contextMenu) return;
    const msg = contextMenu.message;
    setEditingMessage(msg);
    setContextMenu(null);
    setReplyTo(null);
    setActionError(null);
    draftRef.current = msg.content;
    setDraft(msg.content);
    inputRef.current?.setNativeProps({ text: msg.content });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [contextMenu]);

  const cancelEditing = useCallback(() => {
    setEditingMessage(null);
    draftRef.current = '';
    setDraft('');
    inputRef.current?.clear();
  }, []);

  const promptDeleteContextMessage = useCallback(() => {
    if (!contextMenu) return;
    setDeleteConfirm(contextMenu.message);
    setContextMenu(null);
  }, [contextMenu]);

  const confirmDelete = useCallback(() => {
    if (!deleteConfirm) return;
    const messageId = deleteConfirm.id;
    const isRealMessage = !messageId.startsWith('temp-') && isDeliveredMessage(deleteConfirm);
    setDeleteConfirm(null);
    deleteMessage(messageId)
      .catch((e) => {
        console.error('Failed to delete message:', e);
        // Only surface an error for real (persisted) messages; failed/temp
        // bubbles disappear locally on their own.
        if (isRealMessage) {
          setActionError(e instanceof Error ? e.message : 'Could not delete message.');
        }
      });
  }, [deleteConfirm, deleteMessage]);

// Which options the long-press menu shows for the currently-selected message.
// Always Reply; Edit only for own delivered messages still inside the 15-minute
// window; Delete only for own delivered messages still inside the 24-hour window.
const contextOptions = useMemo(() => {
  if (!contextMenu) return [];
  const msg = contextMenu.message;
  const mine = msg.sender_id === currentUserId;
  const delivered = isDeliveredMessage(msg);
  const options: { id: 'reply' | 'edit' | 'delete'; label: string; icon: typeof Reply }[] = [
    { id: 'reply', label: 'Reply', icon: Reply },
  ];
  if (mine && delivered && canSend && isWithinWindow(msg.created_at, EDIT_WINDOW_MS)) {
    options.push({ id: 'edit', label: 'Edit', icon: Pencil });
  }
  if (mine && delivered && isWithinWindow(msg.created_at, DELETE_WINDOW_MS)) {
    options.push({ id: 'delete', label: 'Delete', icon: Trash2 });
  }
  return options;
}, [contextMenu, currentUserId, canSend]);

// Clamp the floating card so it stays on screen. Defaults to hovering ABOVE
// the touch point; flips below the touch near the top.
const contextLayout = useMemo(() => {
  if (!contextMenu) return null;
  const { x, y } = contextMenu;
  const margin = Spacing.sm;
  const minTop = insets.top + margin;
  const cardH = Math.max(1, contextOptions.length) * CONTEXT_OPTION_H;
  const left = Math.max(
    margin,
    Math.min(x - CONTEXT_CARD_W + 24, windowWidth - CONTEXT_CARD_W - margin),
  );
  const above = y - cardH - 14 >= minTop;
  const top = above ? y - cardH - 14 : y + 18;
  return { left, top };
}, [contextMenu, insets.top, windowWidth, contextOptions.length]);

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

  // The send button is decoupled from the network round-trip: it INSTANTLY
  // clears the input and lets the chat thread place the optimistic bubble
  // (clock → check once realtime/DB confirms). The API call then runs in the
  // background — typing the next message is never blocked on the send, and a
  // failure (bubble removed by useChat) never restores the cleared text,
  // because the user may already be typing the next message. When editing a
  // message, the same button commits the edit (optimistic, with revert).
  const handleSend = () => {
    // draftRef (not the `draft` state) is the live source of truth for the
    // input text — read it here so the ref is cleared in this exact tick.
    const text = draftRef.current.trim();
    if (!text || !canSend) return;

    const editing = editingMessage;
    if (editing) {
      cancelEditing();
      setActionError(null);
      editMessage(editing.id, text).catch((e) => {
        console.error('Failed to edit message:', e);
        setActionError(e instanceof Error ? e.message : 'Could not edit message.');
      });
      return;
    }

    const reply = replyTo;
    draftRef.current = '';
    // The input is UNCONTROLLED (no `value` prop), so clear() is the only way
    // the native text ever becomes ''. Nothing can re-assert the old text:
    // controlled reconciliation or a stale keystroke landing before a re-render.
    inputRef.current?.clear();
    setDraft('');
    setReplyTo(null);
    // On web the send-button tap can steal focus and collapse the keyboard.
    // The button is excluded from focus (tabIndex -1) so THIS never happens —
    // this focus() is only a no-op safety net when focus was already on the
    // input, and never causes a flash by itself.
    if (Platform.OS === 'web') {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    sendMessage(text, reply?.id).then(
      () => scrollToBottom(true),
      (e) => console.error('Failed to send message:', e),
    );
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
          ellipsizeMode="tail"
          selectable={true}
        >
          {preview.content}
        </ThemedText>
      </View>
    );
  };

  const renderMessage = ({ item, index }: { item: T; index: number }) => {
    const mine = item.sender_id === currentUserId;
    const isSending = item.status === 'sending';
    // displayMessages is newest-first, so the chronologically-previous message
    // sits at index + 1. Consecutive messages from the same sender are grouped:
    // only the FIRST message of a group shows the avatar (and sender name).
    const prev = displayMessages[index + 1] ?? null;
    const isGroupStart = !prev || prev.sender_id !== item.sender_id;
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
          onLongPress={(e) => handleLongPress(item, e)}
          onPress={(e) => handleMessagePress(item, e)}
          delayLongPress={350}
          style={({ pressed }) => [
            styles.msgRow,
            mine ? styles.msgRowMine : styles.msgRowOther,
            pressed && { opacity: 0.85 },
          ]}
        >
          {!mine && isGroupStart && (
            <UserAvatar avatarUrl={item.sender?.avatar_url} size={30} style={styles.msgAvatar} />
          )}
          <View
            style={[
              styles.bubbleWrap,
              mine ? styles.bubbleWrapMine : null,
              !isGroupStart && !mine && styles.groupIndentLeft,
            ]}
          >
            <View
              style={[
                styles.bubble,
                mine
                  ? { backgroundColor: '#10B981', borderColor: '#10B981' }
                  : { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              {renderReplyPreview(item, mine)}
              {!mine && isGroupStart && (
                <ThemedText
                  variant="caption"
                  style={[styles.bubbleSenderName, { color: theme.textSecondary }]}
                >
                  {item.sender?.username ?? 'Unknown'}
                </ThemedText>
              )}
              <ThemedText
                variant="body"
                style={[styles.bubbleText, mine ? { color: '#FFFFFF' } : null]}
                ellipsizeMode="tail"
                selectable={true}
              >
                {item.content}
              </ThemedText>
              <View style={styles.bubbleFooter}>
                {mine && (
                  <View style={styles.msgStatus}>
                    {item.status === 'failed' ? (
                      <Pressable onPress={() => setFailedMenu(item)} hitSlop={10}>
                        <AlertTriangle size={12} color="#EF4444" strokeWidth={2.5} />
                      </Pressable>
                    ) : isSending ? (
                      <Clock size={12} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                    ) : (
                      <Check size={12} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                    )}
                  </View>
                )}
                <ThemedText
                  variant="caption"
                  style={[
                    styles.msgTime,
                    { color: mine ? 'rgba(255,255,255,0.7)' : theme.textSecondary },
                  ]}
                >
                  {formatMessageTime(item.created_at)}
                </ThemedText>
                {item.edited_at && (
                  <ThemedText
                    variant="caption"
                    style={[
                      styles.msgTime,
                      styles.editedMark,
                      { color: mine ? 'rgba(255,255,255,0.7)' : theme.textSecondary },
                    ]}
                  >
                    Edited
                  </ThemedText>
                )}
              </View>
            </View>
          </View>
        </Pressable>
      </View>
    );
  };

  const placeholder = hasLeft
    ? 'You are no longer in this chat'
    : canSend
      ? 'Type a message...'
      : 'Chat is unavailable';

  const sendDisabled = !canSend || !draft.trim();

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
                  // Keep the keyboard open while the user taps/holds a message —
                  // with the default ("never") the FIRST tap is swallowed to
                  // dismiss the keyboard and the long-press never fires.
                  keyboardShouldPersistTaps="handled"
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

              {editingMessage && (
                <View
                  style={[
                    styles.replyBar,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}
                >
                  <Pencil size={14} color="#3B82F6" strokeWidth={2.5} />
                  <View style={styles.replyBarText}>
                    <ThemedText variant="caption" numberOfLines={1} style={[styles.replyBarName, { color: '#3B82F6' }]}>
                      Editing message
                    </ThemedText>
                    <ThemedText variant="caption" muted numberOfLines={1}>
                      {editingMessage.content}
                    </ThemedText>
                  </View>
                  <Pressable onPress={cancelEditing} hitSlop={10}>
                    <X size={16} color={theme.textSecondary} strokeWidth={2.5} />
                  </Pressable>
                </View>
              )}

              {actionError && (
                <View style={styles.errorRow}>
                  <ThemedText variant="caption" style={[styles.errorText, { color: '#EF4444' }]}>
                    {actionError}
                  </ThemedText>
                  <Pressable onPress={() => setActionError(null)} hitSlop={10}>
                    <X size={14} color="#EF4444" strokeWidth={2.5} />
                  </Pressable>
                </View>
              )}

              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  onChangeText={(text) => {
                    draftRef.current = text;
                    setDraft(text);
                  }}
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
                  onPointerDown={(e) => {
                    // Web-only: block the button's default mouse-down action so
                    // the TextInput never blurs → no keyboard flash. onPress
                    // still fires; only the native focus-move is suppressed.
                    if (Platform.OS === 'web') e.preventDefault();
                  }}
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
                  {editingMessage ? (
                    <CheckCheck size={18} color={sendDisabled ? theme.textSecondary : '#FFFFFF'} />
                  ) : (
                    <Send size={18} color={sendDisabled ? theme.textSecondary : '#FFFFFF'} />
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>

          {/* Floating long-press context menu. Rendered INLINE (not a Modal) so
              the keyboard stays open while it's showing. On iOS the backdrop is
              frosted (BlurView); everywhere else it falls back to a dim
              overlay, so the chat always reads as "background". */}
          {contextMenu && contextLayout && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable style={styles.contextBackdrop} onPress={() => setContextMenu(null)}>
                {Platform.OS === 'ios' && (
                  <BlurView
                    tint={theme.resolvedColorScheme === 'dark' ? 'dark' : 'light'}
                    intensity={60}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <View
                  style={[
                    styles.contextBackdropDim,
                    {
                      backgroundColor:
                        theme.resolvedColorScheme === 'dark'
                          ? 'rgba(0,0,0,0.5)'
                          : 'rgba(0,0,0,0.35)',
                    },
                  ]}
                />
              </Pressable>
              <View
                style={[
                  styles.contextCard,
                  {
                    left: contextLayout.left,
                    top: contextLayout.top,
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  },
                ]}
              >
                {contextOptions.map((option, idx) => {
                  const Icon = option.icon;
                  return (
                    <Pressable
                      key={option.id}
                      style={[
                        styles.contextOption,
                        idx < contextOptions.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: theme.border,
                        },
                      ]}
                      onPress={() => {
                        if (option.id === 'reply') replyToContextMessage();
                        else if (option.id === 'edit') startEditing();
                        else if (option.id === 'delete') promptDeleteContextMessage();
                      }}
                    >
                      <View style={styles.contextOptionRow}>
                        <Icon size={18} color={theme.text} strokeWidth={2.5} />
                        <ThemedText
                          variant="body"
                          style={[styles.contextOptionText, { color: theme.text, fontWeight: '600' }]}
                        >
                          {option.label}
                        </ThemedText>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Failed-message menu: tapped from the warning icon on a bubble whose
              write failed. Offers Resend (replaces the bubble in place) or
              Delete (drops the local bubble). */}
          {failedMenu && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable style={styles.contextBackdrop} onPress={() => setFailedMenu(null)}>
                <BlurView
                  tint={theme.resolvedColorScheme === 'dark' ? 'dark' : 'light'}
                  intensity={10}
                  style={StyleSheet.absoluteFill}
                />
              </Pressable>
              <View
                style={[
                  styles.failedCard,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <Pressable
                  style={[styles.failedOption, { borderBottomColor: theme.border }]}
                  onPress={() => {
                    resendMessage(failedMenu);
                    setFailedMenu(null);
                  }}
                >
                  <View style={styles.failedOptionRow}>
                    <RefreshCw size={18} color="#10B981" strokeWidth={2.5} />
                    <ThemedText variant="body" style={[styles.failedOptionText, { color: '#10B981', fontWeight: '600' }]}>
                      Resend
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable
                  style={styles.failedOption}
                  onPress={() => {
                    deleteMessage(failedMenu.id);
                    setFailedMenu(null);
                  }}
                >
                  <View style={styles.failedOptionRow}>
                    <Trash2 size={18} color="#EF4444" strokeWidth={2.5} />
                    <ThemedText variant="body" style={[styles.failedOptionText, { color: '#EF4444', fontWeight: '600' }]}>
                      Delete
                    </ThemedText>
                  </View>
                </Pressable>
              </View>
            </View>
          )}

          {/* Delete-confirmation card: shown after picking Delete on an own
              delivered message. Delete for everyone is permanent, so this
              double-checks before the bubble is removed (hard delete). */}
          {deleteConfirm && (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable style={styles.contextBackdrop} onPress={() => setDeleteConfirm(null)}>
                <BlurView
                  tint={theme.resolvedColorScheme === 'dark' ? 'dark' : 'light'}
                  intensity={10}
                  style={StyleSheet.absoluteFill}
                />
              </Pressable>
              <View
                style={[
                  styles.deleteConfirmCard,
                  { backgroundColor: theme.background, borderColor: theme.border },
                ]}
              >
                <ThemedText
                  variant="body"
                  style={[styles.deleteConfirmTitle, { color: '#EF4444', fontWeight: '700' }]}
                >
                  Delete this message?
                </ThemedText>
                <ThemedText variant="caption" muted style={styles.deleteConfirmSubtitle}>
                  This will delete the message for everyone. This action cannot be undone.
                </ThemedText>
                <View style={styles.deleteConfirmActions}>
                  <Pressable
                    style={[
                      styles.deleteConfirmBtn,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}
                    onPress={() => setDeleteConfirm(null)}
                  >
                    <ThemedText variant="body" style={{ fontWeight: '600' }}>
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    style={[styles.deleteConfirmBtn, { backgroundColor: '#EF4444' }]}
                    onPress={confirmDelete}
                  >
                    <ThemedText variant="body" style={{ color: '#FFFFFF', fontWeight: '700' }}>
                      Delete
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
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
    marginBottom: 0,
  },
  bubbleWrap: {
    maxWidth: MAX_BUBBLE_WIDTH,
    gap: 2,
  },
  bubbleWrapMine: {
    alignItems: 'flex-end',
  },
  groupIndentLeft: {
    marginLeft: 30 + Spacing.sm,
  },
  bubbleSenderName: {
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 2,
  },
  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderWidth: 1,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: 2,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
    marginTop: 2,
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
    lineHeight: 18,
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
  editedMark: {
    fontStyle: 'italic',
    marginLeft: 4,
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
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
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
  contextBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  contextBackdropDim: {
    ...StyleSheet.absoluteFill,
  },
  contextCard: {
    position: 'absolute',
    width: CONTEXT_CARD_W,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  contextOption: {
    paddingVertical: Spacing.md,
  },
  contextOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  contextOptionText: {
    fontSize: 15,
  },
  failedCard: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    minWidth: 220,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.sm,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  failedOption: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  failedOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  failedOptionText: {
    fontSize: 15,
  },
  deleteConfirmCard: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    width: 300,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.lg,
    gap: Spacing.sm,
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  deleteConfirmTitle: {
    textAlign: 'center',
    fontSize: 16,
  },
  deleteConfirmSubtitle: {
    textAlign: 'center',
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  deleteConfirmBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
