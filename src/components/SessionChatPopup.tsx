import { ChatPopup } from '@/components/ChatPopup';
import type { ChatThread } from '@/hooks/useChat';
import type { Session, SessionChatMessage } from '@/types';

type SessionChatPopupProps = {
  sessionId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  session?: Partial<Session> | null;
  canSend: boolean;
  hasLeft?: boolean;
  chat: ChatThread<SessionChatMessage>;
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

export function SessionChatPopup({
  sessionId,
  visible,
  onClose,
  currentUserId,
  session,
  canSend,
  hasLeft = false,
  chat,
}: SessionChatPopupProps) {
  const headerSubtitle = [
    session?.location ?? '',
    session?.date_time
      ? `${formatSessionDate(session.date_time)} ${formatSessionTime(session.date_time)}`
      : '',
    session?.commitment_count != null ? `${session.commitment_count}/${session.max_participants}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ChatPopup
      visible={visible}
      onClose={onClose}
      currentUserId={currentUserId}
      headerTitle={`${session?.title ?? session?.purpose ?? 'Session'} Chat`}
      headerSubtitle={headerSubtitle || undefined}
      canSend={canSend}
      hasLeft={hasLeft}
      chat={chat}
      chatType="session"
      chatId={sessionId}
    />
  );
}
