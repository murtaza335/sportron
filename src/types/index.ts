export type UserRole = 'student' | 'teacher';
export type MatchFormat = 'singles' | 'doubles';

export type Profile = {
  id: string;
  display_name: string;
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
  created_at: string;
  updated_at: string;
};

export type GuestProfile = {
  id: string;
  display_name: string;
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
  player: Pick<Profile, 'id' | 'display_name'> | null;
  playerPartner: Pick<Profile, 'id' | 'display_name'> | null;
  opponent: Pick<Profile, 'id' | 'display_name'> | null;
  opponentPartner: Pick<Profile, 'id' | 'display_name'> | null;
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
  profile: Pick<Profile, 'display_name'> | null;
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
  displayName: string;
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
  | 'match_commented';

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
