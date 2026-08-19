export type UserRole = 'student' | 'teacher';
export type MatchFormat = 'singles' | 'doubles';

export type Sport =
  | 'table_tennis'
  | 'badminton'
  | 'tennis'
  | 'squash'
  | 'pickleball'
  | 'football'
  | 'cricket'
  | 'volleyball'
  | 'handball'
  | 'basketball'
  | 'other';

export const RACKET_SPORTS: Sport[] = ['table_tennis', 'badminton', 'tennis', 'squash', 'pickleball'];
export const TEAM_SPORTS: Sport[] = ['football', 'cricket', 'volleyball', 'handball', 'basketball'];

export const SPORT_LABELS: Record<Sport, string> = {
  table_tennis: 'Table Tennis',
  badminton: 'Badminton',
  tennis: 'Tennis',
  squash: 'Squash',
  pickleball: 'Pickleball',
  football: 'Football',
  cricket: 'Cricket',
  volleyball: 'Volleyball',
  handball: 'Handball',
  basketball: 'Basketball',
  other: 'Other',
};

export function isRacketSport(sport: Sport): boolean {
  return RACKET_SPORTS.includes(sport);
}

export function isTeamSport(sport: Sport): boolean {
  return TEAM_SPORTS.includes(sport);
}

// Sessions ask for a "purpose" instead of a sport: a sport, a walk, chit-chat, etc.
export const SESSION_PURPOSES = [
  ...RACKET_SPORTS,
  ...TEAM_SPORTS,
  'walk',
  'chit_chat',
  'other',
] as const;

export type SessionPurpose = (typeof SESSION_PURPOSES)[number];

export const SESSION_PURPOSE_LABELS: Record<SessionPurpose, string> = {
  table_tennis: 'Table Tennis',
  badminton: 'Badminton',
  tennis: 'Tennis',
  squash: 'Squash',
  pickleball: 'Pickleball',
  football: 'Football',
  cricket: 'Cricket',
  volleyball: 'Volleyball',
  handball: 'Handball',
  basketball: 'Basketball',
  walk: 'Walk',
  chit_chat: 'Chit-Chat',
  other: 'Other',
};

export function formatSessionPurpose(purpose: string): string {
  return SESSION_PURPOSE_LABELS[purpose as SessionPurpose] ?? purpose;
}

export const MAX_SESSION_TITLE_LENGTH = 40;

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  role: UserRole;
  avatar_url: string | null;
  fcm_tokens: string[];
  notification_preferences: NotificationPreferences;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferences = {
  match_pending: boolean;
  match_approved: boolean;
  match_rejected: boolean;
  match_liked: boolean;
  match_commented: boolean;
  session_application: boolean;
  session_accepted: boolean;
  session_rejected: boolean;
  session_left: boolean;
  session_reminder: boolean;
  feedback_prompt: boolean;
  ping: boolean;
  join_request: boolean;
  join_approved: boolean;
  join_rejected: boolean;
  match_approval_request: boolean;
  match_approved_community: boolean;
  match_disputed: boolean;
  member_removed: boolean;
  admin_transferred: boolean;
  community_match_pending: boolean;
  community_match_approved: boolean;
  community_match_disputed: boolean;
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
  sport: Sport;
  custom_sport_name: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  player_score: number;
  opponent_score: number;
  is_public: boolean;
  verification_status: 'pending' | 'verified' | 'disputed';
  created_at: string;
};

export type MatchWithProfiles = Match & {
  player: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  playerPartner: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  opponent: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  opponentPartner: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  likes_count: number;
  comments_count: number;
  is_liked_by_user: boolean;
};

export type CreateProfileInput = {
  username: string;
  bio?: string;
  role: UserRole;
  avatarUrl?: string;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  match_pending: true,
  match_approved: true,
  match_rejected: true,
  match_liked: true,
  match_commented: true,
  session_application: true,
  session_accepted: true,
  session_rejected: true,
  session_left: true,
  session_reminder: true,
  feedback_prompt: true,
  ping: true,
  join_request: true,
  join_approved: true,
  join_rejected: true,
  match_approval_request: true,
  match_approved_community: true,
  match_disputed: true,
  member_removed: true,
  admin_transferred: true,
  community_match_pending: true,
  community_match_approved: true,
  community_match_disputed: true,
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
  | 'session_left'
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
  | 'admin_transferred'
  | 'admin_promoted'
  | 'community_match_pending'
  | 'community_match_approved'
  | 'community_match_disputed'
  | 'community_invite'
  | 'community_invite_accepted'
  | 'community_invite_rejected'
  | 'session_chat_message'
  | 'session_chat_reply'
  | 'community_chat_message'
  | 'community_chat_reply';

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
  organization: string | null;
  location: string | null;
  image_url: string | null;
  visibility: CommunityVisibility;
  sport: Sport;
  created_by: string;
  created_at: string;
  updated_at: string;
  pings_enabled: boolean;
  member_count?: number;
  creator?: Pick<Profile, 'id' | 'username'> | null;
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
  profile?: Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> | null;
};

export type CreateCommunityInput = {
  name: string;
  description?: string;
  organization?: string;
  location?: string;
  visibility: CommunityVisibility;
  sport: Sport;
  image_url?: string;
};

export type UpdateCommunityInput = {
  name?: string;
  description?: string | null;
  organization?: string | null;
  location?: string | null;
  visibility?: CommunityVisibility;
  image_url?: string | null;
  pings_enabled?: boolean;
};

export type CommunityJoinRequest = {
  id: string;
  community_id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
};

export type CommunityInvite = {
  id: string;
  community_id: string;
  invited_by: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  community?: Pick<Community, 'id' | 'name' | 'image_url'> | null;
  inviter?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  invitee?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
};

export type Ping = {
  id: string;
  community_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender?: Pick<Profile, 'id' | 'username'> | null;
};

export type CommunityMatch = {
  id: string;
  community_id: string;
  recorded_by: string;
  player_id: string;
  player_partner_id: string | null;
  opponent_id: string;
  opponent_partner_id: string | null;
  sport: Sport;
  custom_sport_name: string | null;
  team_a_name: string | null;
  team_b_name: string | null;
  player_score: number;
  opponent_score: number;
  approval_status: 'pending' | 'approved' | 'disputed';
  created_at: string;
  updated_at: string;
  recorder?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  player?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  playerPartner?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  opponent?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  opponentPartner?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  likes_count?: number;
  comments_count?: number;
  is_liked_by_user?: boolean;
};

export type CommunityMatchComment = {
  id: string;
  community_match_id: string;
  profile_id: string;
  content: string;
  created_at: string;
  profile?: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
};

export type SessionStatus = 'open' | 'full' | 'closed' | 'completed' | 'cancelled';

export type Session = {
  id: string;
  created_by: string;
  purpose: string;
  title: string | null;
  location: string;
  date_time: string;
  expires_at: string | null;
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
  purpose: SessionPurpose;
  title: string;
  location: string;
  date_time: string;
  max_participants: number;
  description?: string;
  expireAfterMinutes?: number;
};

export type CommitmentStatus = 'pending' | 'accepted' | 'rejected' | 'left';
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

export type ChatSender = Pick<Profile, 'id' | 'username' | 'avatar_url'>;

export type ChatReplyRef = {
  id: string;
  sender_id?: string | null;
  content: string;
  sender?: ChatSender | null;
};

// Shared shape for both session and community chat messages. Sender info is
// snapshotted at insert time (no join needed for realtime payloads); replies
// carry only a reference + client-side resolution.
export type ChatMessageBase = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  reply_to_id?: string | null;
  sender_username?: string | null;
  sender_avatar_url?: string | null;
  sender?: ChatSender | null;
  reply_to?: ChatReplyRef | null;
  status?: 'sending' | 'delivered';
  tempId?: string;
};

export type SessionChatMessage = ChatMessageBase & {
  session_id: string;
};

export type CommunityChatMessage = ChatMessageBase & {
  community_id: string;
};
