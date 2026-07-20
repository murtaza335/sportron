export type UserRole = 'student' | 'teacher';
export type MatchFormat = 'singles' | 'doubles';

export type Profile = {
  id: string;
  username: string;
  bio: string | null;
  role: UserRole;
  avatar_url: string | null;
  fcm_tokens: string[];
  notification_preferences: {
    match_pending: boolean;
    match_approved: boolean;
    match_rejected: boolean;
    match_liked: boolean;
    match_commented: boolean;
  };
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GuestProfile = {
  id: string;
  username: string;
  role: string;
  isGuest: true;
  bio: null;
  avatar_url: null;
  fcm_tokens: string[];
  notification_preferences: {
    match_pending: boolean;
    match_approved: boolean;
    match_rejected: boolean;
    match_liked: boolean;
    match_commented: boolean;
  };
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Match = {
  id: string;
  created_by: string;
  player_id: string;
  player_partner_id: string | null;
  opponent_id: string | null;
  opponent_partner_id: string | null;
  opponent_guest_name: string | null;
  match_format: MatchFormat;
  player_score: number;
  opponent_score: number;
  is_public: boolean;
  verification_status: 'pending' | 'verified' | 'disputed';
  created_at: string;
};

export type MatchWithProfiles = Match & {
  player: Pick<Profile, 'id' | 'username'> | null;
  playerPartner: Pick<Profile, 'id' | 'username'> | null;
  opponent: Pick<Profile, 'id' | 'username'> | null;
  opponentPartner: Pick<Profile, 'id' | 'username'> | null;
  likes_count: number;
  comments_count: number;
  is_liked_by_user: boolean;
};

export type MatchComment = {
  id: string;
  match_id: string;
  profile_id: string;
  content: string;
  created_at: string;
  profile: Pick<Profile, 'username'> | null;
};

export type CreateMatchInput = {
  matchFormat: MatchFormat;
  playerPartnerId: string | null;
  opponentId: string | null;
  opponentPartnerId: string | null;
  opponentGuestName: string | null;
  playerScore: number;
  opponentScore: number;
  isPublic: boolean;
};

export type CreateProfileInput = {
  username: string;
  bio?: string;
  role: UserRole;
  avatarUrl?: string;
};

export type MatchStats = {
  total: number;
  wins: number;
  losses: number;
};

export type NotificationType =
  | 'match_pending'
  | 'match_approved'
  | 'match_rejected'
  | 'match_liked'
  | 'match_commented'
  | 'session_application'
  | 'session_accepted'
  | 'session_rejected'
  | 'session_reminder'
  | 'feedback_prompt'
  | 'ping'
  | 'join_request'
  | 'join_approved'
  | 'join_rejected'
  | 'match_approval_request'
  | 'match_approved_community'
  | 'match_disputed'
  | 'member_removed'
  | 'community_deleted'
  | 'admin_transferred';

export type InAppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

export type CommunityVisibility = 'public' | 'restricted';

export type Community = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  visibility: CommunityVisibility;
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count?: number;
};

export type CommunityMemberRole = 'admin' | 'member';

export type CommunityMember = {
  community_id: string;
  profile_id: string;
  role: CommunityMemberRole;
  approval_status: 'approved' | 'pending' | 'rejected';
  matches_played: number;
  wins: number;
  losses: number;
  win_ratio: number;
  joined_at: string;
};

export type CreateCommunityInput = {
  name: string;
  description?: string;
  visibility: CommunityVisibility;
};

export type SessionStatus = 'open' | 'full' | 'closed' | 'completed' | 'cancelled';

export type Session = {
  id: string;
  created_by: string;
  sport: string;
  location: string;
  date_time: string;
  max_participants: number;
  description: string | null;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  creator?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  commitment_count?: number;
  my_commitment?: Pick<Commitment, 'id' | 'status'> | null;
};

export type CreateSessionInput = {
  sport: string;
  location: string;
  date_time: string;
  max_participants: number;
  description?: string;
};

export type CommitmentStatus = 'pending' | 'accepted' | 'rejected';
export type FeedbackStatus = 'showed_up' | 'no_show';

export type Commitment = {
  id: string;
  session_id: string;
  user_id: string;
  status: CommitmentStatus;
  feedback_status: FeedbackStatus | null;
  feedback_provided_by: string | null;
  created_at: string;
  updated_at: string;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    completed_sessions?: number;
    total_committed_sessions?: number;
  } | null;
};
