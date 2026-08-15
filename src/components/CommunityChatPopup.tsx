import { ChatPopup } from '@/components/ChatPopup';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityChat } from '@/hooks/useCommunityChat';
import { SPORT_LABELS } from '@/types';
import type { Community } from '@/types';

type CommunityChatPopupProps = {
  communityId: string | null;
  visible: boolean;
  onClose: () => void;
  currentUserId?: string;
  community?: Partial<Community> | null;
};

export function CommunityChatPopup({
  communityId,
  visible,
  onClose,
  currentUserId,
  community,
}: CommunityChatPopupProps) {
  const { profile } = useAuth();
  const chat = useCommunityChat(communityId, currentUserId, true, profile);

  const headerSubtitle = [
    community?.sport ? (SPORT_LABELS[community.sport] ?? community.sport) : '',
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
    />
  );
}
