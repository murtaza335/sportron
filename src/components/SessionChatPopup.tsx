import { MessageCircle, Send, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
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
  const { messages, loading, sending, sendMessage } = useSessionChat(
    sessionId,
    currentUserId,
    !hasLeft,
  );

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<SessionChatMessage>>(null);

  const scrollToEnd = () => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  };

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    const text = draft;
    setDraft('');
    try {
      await sendMessage(text);
    } catch (e: any) {
      setDraft(text);
      console.error('Failed to send message:', e);
    }
  };

  const renderMessage = ({ item }: { item: SessionChatMessage }) => {
    const mine = item.sender_id === currentUserId;
    return (
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
            <ThemedText
              variant="body"
              style={[styles.bubbleText, mine ? { color: '#FFFFFF' } : null]}
            >
              {item.content}
            </ThemedText>
          </View>
          <ThemedText variant="caption" muted style={styles.msgTime}>
            {formatMessageTime(item.created_at)}
          </ThemedText>
        </View>
      </View>
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
                data={messages}
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
              disabled={!canSend || !draft.trim() || sending}
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor:
                    !canSend || !draft.trim() ? theme.backgroundElement : '#10B981',
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Send size={18} color={!canSend || !draft.trim() ? theme.textSecondary : '#FFFFFF'} />
              )}
            </Pressable>
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
  msgTime: {
    fontSize: 10,
    marginLeft: 4,
    marginTop: 1,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
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
