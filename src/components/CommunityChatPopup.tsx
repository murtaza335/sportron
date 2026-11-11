import { ChatPopup } from '@/components/ChatPopup';
import type { ChatThread } from '@/hooks/useChat';
import { communitySportLabel } from '@/types';
import type { Community, CommunityChatMessage } from '@/types';

type CommunityChatPopupProps = {
  communityId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  community?: Partial<Community> | null;
  chat: ChatThread<CommunityChatMessage>;
};

export function CommunityChatPopup({
  communityId,
  visible,
  onClose,
  currentUserId,
  community,
  chat,
}: CommunityChatPopupProps) {
  const headerSubtitle = [
    community?.sport ? communitySportLabel({ sport: community.sport, custom_sport_name: community.custom_sport_name }) : '',
    community?.member_count != null ? `${community.member_count} members` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ChatPopup
      visible={visible}
      onClose={onClose}
      currentUserId={currentUserId}
      headerTitle={`${community?.name ?? 'Community'} Chat`}
      headerSubtitle={headerSubtitle || undefined}
      canSend
      chat={chat}
      chatType="community"
      chatId={communityId}
    />
  );
}
