import { supabase } from '@/lib/supabase';
import type {
  Community,
  CommunityInvite,
  CommunityMemberStats,
  CommunityJoinRequest,
  CommunityMatch,
  CommunityMatchComment,
  CommunityMember,
  CommunityMemberRole,
  CommunityPost,
  CommunityPostComment,
  CommunityPostType,
  CreateCommunityInput,
  Ping,
  Sport,
  UpdateCommunityInput,
} from '@/types';
import { fetchProfile } from './profiles';
import { updateStreak } from './streak';

// ---------------------------------------------------------------------------
// RPC row types — matches the column aliases returned by the SECURITY DEFINER
// functions in migration 047. These are internal; the public API remains the
// existing Community / CommunityMember / etc. types from @/types.
// ---------------------------------------------------------------------------

type CommunityRpcRow = {
  id: string; name: string; description: string | null; organization: string | null;
  location: string | null; image_url: string | null; visibility: string; sport: string;
  created_by: string; created_at: string; updated_at: string; pings_enabled: boolean;
  member_count: number; creator_username: string | null; creator_avatar_url: string | null;
};

function rowToCommunity(r: CommunityRpcRow): Community {
  return {
    id: r.id, name: r.name, description: r.description, organization: r.organization,
    location: r.location, image_url: r.image_url, visibility: r.visibility as any,
    sport: r.sport as any, created_by: r.created_by, created_at: r.created_at,
    updated_at: r.updated_at, pings_enabled: r.pings_enabled,
    member_count: Number(r.member_count) ?? 0,
    creator: r.creator_username
      ? { id: r.created_by, username: r.creator_username }
      : null,
  };
}

type MemberRpcRow = {
  community_id: string; profile_id: string; role: string; approval_status: string;
  matches_played: number; wins: number; losses: number; win_ratio: number;
  joined_at: string; username: string | null; display_name: string | null; avatar_url: string | null;
};

function rowToMember(r: MemberRpcRow): CommunityMember {
  return {
    community_id: r.community_id, profile_id: r.profile_id,
    role: r.role as CommunityMemberRole, approval_status: r.approval_status as any,
    matches_played: r.matches_played, wins: r.wins, losses: r.losses,
    win_ratio: r.win_ratio, joined_at: r.joined_at,
    profile: r.username
      ? { id: r.profile_id, username: r.username, display_name: r.display_name, avatar_url: r.avatar_url }
      : null,
  } as CommunityMember;
}

type InviteRpcRow = {
  id: string; community_id: string; invited_by: string; invitee_id: string;
  status: string; created_at: string; updated_at: string;
  community_name: string | null; community_image_url: string | null;
  inviter_username: string | null; inviter_avatar_url: string | null;
  invitee_username: string | null; invitee_avatar_url: string | null;
};

function rowToInvite(r: InviteRpcRow): CommunityInvite {
  return {
    id: r.id, community_id: r.community_id, invited_by: r.invited_by,
    invitee_id: r.invitee_id, status: r.status as any,
    created_at: r.created_at, updated_at: r.updated_at,
    community: r.community_name
      ? { id: r.community_id, name: r.community_name, image_url: r.community_image_url }
      : null,
    inviter: r.inviter_username
      ? { id: r.invited_by, username: r.inviter_username, avatar_url: r.inviter_avatar_url }
      : null,
    invitee: r.invitee_username
      ? { id: r.invitee_id, username: r.invitee_username, avatar_url: r.invitee_avatar_url }
      : null,
  } as CommunityInvite;
}

type CommentRpcRow = {
  id: string; community_match_id: string; profile_id: string;
  content: string; created_at: string;
  username: string | null; avatar_url: string | null;
};

function rowToComment(r: CommentRpcRow): CommunityMatchComment {
  return {
    id: r.id, community_match_id: r.community_match_id, profile_id: r.profile_id,
    content: r.content, created_at: r.created_at,
    profile: r.username
      ? { id: r.profile_id, username: r.username, avatar_url: r.avatar_url }
      : null,
  } as CommunityMatchComment;
}

type MatchRpcRow = {
  id: string; community_id: string; recorded_by: string;
  player_id: string; player_partner_id: string | null;
  opponent_id: string; opponent_partner_id: string | null;
  sport: string; custom_sport_name: string | null;
  team_a_name: string | null; team_b_name: string | null;
  player_score: number; opponent_score: number;
  approval_status: string; created_at: string; updated_at: string;
  recorder_username: string | null; recorder_avatar_url: string | null;
  player_username: string | null; player_avatar_url: string | null;
  player_partner_username: string | null; player_partner_avatar_url: string | null;
  opponent_username: string | null; opponent_avatar_url: string | null;
  opponent_partner_username: string | null; opponent_partner_avatar_url: string | null;
  likes_count: number; comments_count: number; is_liked_by_user: boolean;
};

function rowToMatch(r: MatchRpcRow): CommunityMatch {
  const profile = (username: string | null, avatar: string | null, id: string) =>
    username ? { id, username, avatar_url: avatar } : null;
  return {
    id: r.id, community_id: r.community_id, recorded_by: r.recorded_by,
    player_id: r.player_id, player_partner_id: r.player_partner_id,
    opponent_id: r.opponent_id, opponent_partner_id: r.opponent_partner_id,
    sport: r.sport as any, custom_sport_name: r.custom_sport_name,
    team_a_name: r.team_a_name, team_b_name: r.team_b_name,
    player_score: r.player_score, opponent_score: r.opponent_score,
    approval_status: r.approval_status as any,
    created_at: r.created_at, updated_at: r.updated_at,
    recorder: profile(r.recorder_username, r.recorder_avatar_url, r.recorded_by),
    player: profile(r.player_username, r.player_avatar_url, r.player_id),
    playerPartner: profile(r.player_partner_username, r.player_partner_avatar_url, r.player_partner_id!),
    opponent: profile(r.opponent_username, r.opponent_avatar_url, r.opponent_id),
    opponentPartner: profile(r.opponent_partner_username, r.opponent_partner_avatar_url, r.opponent_partner_id!),
    likes_count: Number(r.likes_count) ?? 0,
    comments_count: Number(r.comments_count) ?? 0,
    is_liked_by_user: r.is_liked_by_user,
  };
}

export async function fetchPublicCommunities(): Promise<Community[]> {
  const { data, error } = await supabase.rpc('get_public_communities');
  if (error) throw error;
  return (data ?? []).map(rowToCommunity);
}

export async function fetchMyCommunities(userId: string): Promise<Community[]> {
  const { data, error } = await supabase.rpc('get_my_communities');
  if (error) throw error;
  return (data ?? []).map(rowToCommunity);
}

export async function fetchMyCommunityMemberships(
  userId: string,
): Promise<{ community_id: string; role: CommunityMemberRole }[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('community_id, role')
    .eq('profile_id', userId)
    .eq('approval_status', 'approved');

  if (error) throw error;
  return data ?? [];
}

export async function fetchCommunityById(id: string): Promise<Community | null> {
  const { data, error } = await supabase.rpc('get_community_by_id', { p_community_id: id });
  if (error) throw error;
  const row = data?.[0];
  return row ? rowToCommunity(row) : null;
}

export async function createCommunity(
  userId: string,
  input: CreateCommunityInput,
): Promise<Community> {
  const { data, error } = await supabase
    .from('communities')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      organization: input.organization?.trim() || null,
      location: input.location?.trim() || null,
      visibility: input.visibility,
      sport: input.sport,
      image_url: input.image_url || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505' && error.message.includes('idx_communities_name_created_by')) {
      throw new Error('You already have a community with this name.');
    }
    throw error;
  }

  const { error: memberError } = await supabase
    .from('community_members')
    .insert({
      community_id: data.id,
      profile_id: userId,
      role: 'admin',
      approval_status: 'approved',
    });

  if (memberError) throw memberError;

  return { ...data, member_count: 1 };
}

async function requireCommunityAdmin(communityId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: member } = await supabase
    .from('community_members')
    .select('role')
    .eq('community_id', communityId)
    .eq('profile_id', user.id)
    .single();

  if (!member || member.role !== 'admin') {
    throw new Error('Only community admins can perform this action.');
  }
}

export async function updateCommunity(
  communityId: string,
  input: UpdateCommunityInput,
): Promise<void> {
  await requireCommunityAdmin(communityId);

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.organization !== undefined) updates.organization = input.organization?.trim() || null;
  if (input.location !== undefined) updates.location = input.location?.trim() || null;
  if (input.visibility !== undefined) updates.visibility = input.visibility;
  if (input.image_url !== undefined) updates.image_url = input.image_url;
  if (input.pings_enabled !== undefined) updates.pings_enabled = input.pings_enabled;

  const { error } = await supabase
    .from('communities')
    .update(updates)
    .eq('id', communityId);

  if (error) {
    if (error.code === '23505' && error.message.includes('idx_communities_name_created_by')) {
      throw new Error('You already have a community with this name.');
    }
    throw error;
  }
}

export async function setPingsEnabled(communityId: string, enabled: boolean): Promise<void> {
  await requireCommunityAdmin(communityId);

  const { error } = await supabase
    .from('communities')
    .update({ pings_enabled: enabled })
    .eq('id', communityId);

  if (error) throw error;
}

export async function deleteCommunity(communityId: string): Promise<void> {
  await requireCommunityAdmin(communityId);

  const { error } = await supabase
    .from('communities')
    .delete()
    .eq('id', communityId);

  if (error) throw error;
}

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const { data, error } = await supabase.rpc('get_community_members', { p_community_id: communityId });
  if (error) throw error;
  return (data ?? []).map(rowToMember);
}

export async function searchCommunityMembers(
  communityId: string,
  query: string,
): Promise<CommunityMember[]> {
  const normalized = query.trim();
  if (normalized.length < 1) return [];

  const { data, error } = await supabase.rpc('search_community_members', {
    p_community_id: communityId,
    p_query: normalized,
  });

  if (error) throw error;
  return (data ?? []).map(rowToMember);
}

export async function fetchCommunityMember(
  communityId: string,
  userId: string,
): Promise<CommunityMember | null> {
  const { data, error } = await supabase
    .from('community_members')
    .select('*')
    .eq('community_id', communityId)
    .eq('profile_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Compute a member's stats straight from the community's approved matches where
 * they participated (as player, partner, or opponent — singles and doubles).
 * This avoids relying on `community_members.matches_played`, which is only
 * maintained for win/loss outcomes and therefore undercounts draws.
 */
export async function fetchCommunityMemberStats(
  communityId: string,
  profileId: string,
): Promise<CommunityMemberStats> {
  const { data, error } = await supabase
    .from('community_matches')
    .select(
      'player_id, player_partner_id, opponent_id, opponent_partner_id, player_score, opponent_score',
    )
    .eq('community_id', communityId)
    .eq('approval_status', 'approved')
    .or(
      `player_id.eq.${profileId},player_partner_id.eq.${profileId},opponent_id.eq.${profileId},opponent_partner_id.eq.${profileId}`,
    );

  if (error) throw error;

  const matches = data ?? [];
  let wins = 0;
  let losses = 0;

  for (const match of matches) {
    const onPlayerSide =
      match.player_id === profileId || match.player_partner_id === profileId;
    const onOpponentSide =
      match.opponent_id === profileId || match.opponent_partner_id === profileId;
    if (!onPlayerSide && !onOpponentSide) continue;

    if (match.player_score > match.opponent_score) {
      if (onPlayerSide) wins++;
      else losses++;
    } else if (match.opponent_score > match.player_score) {
      if (onOpponentSide) wins++;
      else losses++;
    }
    // Draw — counts as played but neither a win nor a loss.
  }

  const winRatio =
    wins + losses > 0
      ? Math.round((wins / (wins + losses)) * 100 * 100) / 100
      : 0;

  return {
    matches_played: matches.length,
    wins,
    losses,
    win_ratio: winRatio,
  };
}

export async function joinCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .insert({
      community_id: communityId,
      profile_id: userId,
      role: 'member',
      approval_status: 'approved',
    });

  if (error) throw error;
}

export async function requestToJoinCommunity(
  communityId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_join_requests')
    .insert({
      community_id: communityId,
      user_id: userId,
    });

  if (error) throw error;
}

export async function cancelJoinRequest(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_join_requests')
    .delete()
    .eq('community_id', communityId)
    .eq('user_id', userId);

  if (error) throw error;
}

export async function leaveCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('profile_id', userId);

  if (error) throw error;
}

export async function removeMember(
  communityId: string,
  profileId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('profile_id', profileId);

  if (error) throw error;
}

export async function transferAdmin(
  communityId: string,
  currentUserId: string,
  newAdminId: string,
): Promise<void> {
  const { error: demoteError } = await supabase
    .from('community_members')
    .update({ role: 'member' })
    .eq('community_id', communityId)
    .eq('profile_id', currentUserId);

  if (demoteError) throw demoteError;

  const { error: promoteError } = await supabase
    .from('community_members')
    .update({ role: 'admin' })
    .eq('community_id', communityId)
    .eq('profile_id', newAdminId);

  if (promoteError) throw promoteError;
}

export async function fetchJoinRequests(
  communityId: string,
): Promise<CommunityJoinRequest[]> {
  const { data, error } = await supabase.rpc('get_join_requests', { p_community_id: communityId });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, community_id: r.community_id, user_id: r.user_id,
    status: r.status, created_at: r.created_at, updated_at: r.updated_at,
    profile: r.username
      ? { id: r.user_id, username: r.username, avatar_url: r.avatar_url }
      : null,
  }));
}

export async function fetchMyJoinRequest(
  communityId: string,
  userId: string,
): Promise<CommunityJoinRequest | null> {
  const { data, error } = await supabase
    .from('community_join_requests')
    .select('*')
    .eq('community_id', communityId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function respondToJoinRequest(
  requestId: string,
  status: 'approved' | 'rejected',
): Promise<void> {
  const { data: request, error: fetchError } = await supabase
    .from('community_join_requests')
    .select('community_id, user_id')
    .eq('id', requestId)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('community_join_requests')
    .update({ status })
    .eq('id', requestId);

  if (error) throw error;

  if (status === 'approved') {
    const { error: memberError } = await supabase
      .from('community_members')
      .insert({
        community_id: request.community_id,
        profile_id: request.user_id,
        role: 'member',
        approval_status: 'approved',
      });

    if (memberError) throw memberError;
  }
}

export const PING_COOLDOWN_MS = 15 * 60 * 1000;

export async function fetchLastCommunityPing(
  communityId: string,
  senderId: string,
): Promise<Ping | null> {
  const { data, error } = await supabase
    .from('pings')
    .select('*')
    .eq('community_id', communityId)
    .eq('sender_id', senderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function getNextPingTime(
  communityId: string,
  senderId: string,
): Promise<Date | null> {
  const lastPing = await fetchLastCommunityPing(communityId, senderId);
  if (!lastPing) return null;
  const next = new Date(new Date(lastPing.created_at).getTime() + PING_COOLDOWN_MS);
  return next;
}

export async function sendPing(
  communityId: string,
  senderId: string,
  message: string,
): Promise<string> {
  const nextPingTime = await getNextPingTime(communityId, senderId);
  if (nextPingTime && nextPingTime.getTime() > Date.now()) {
    const minutes = Math.ceil((nextPingTime.getTime() - Date.now()) / 60000);
    throw new Error(
      `You can only ping once every 15 minutes. Try again in ${minutes} minute${
        minutes === 1 ? '' : 's'
      }.`,
    );
  }

  const { data: ping, error } = await supabase
    .from('pings')
    .insert({
      community_id: communityId,
      sender_id: senderId,
      message: message.trim(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.message?.includes('only ping once every 15 minutes')) {
      throw new Error('You can only ping once every 15 minutes. Please wait before pinging again.');
    }
    throw error;
  }

  return ping.id;
}

export async function fetchPings(communityId: string): Promise<Ping[]> {
  const { data, error } = await supabase
    .from('pings')
    .select(`
      *,
      sender:sender_id(id, username)
    `)
    .eq('community_id', communityId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

export async function recordCommunityMatch(input: {
  community_id: string;
  recorded_by: string;
  player_id: string;
  opponent_id: string;
  sport: Sport;
  custom_sport_name?: string | null;
  team_a_name?: string | null;
  team_b_name?: string | null;
  player_score: number;
  opponent_score: number;
}): Promise<CommunityMatch> {
  const { data, error } = await supabase
    .from('community_matches')
    .insert({
      community_id: input.community_id,
      recorded_by: input.recorded_by,
      player_id: input.player_id,
      opponent_id: input.opponent_id,
      sport: input.sport,
      custom_sport_name: input.custom_sport_name?.trim() || null,
      team_a_name: input.team_a_name?.trim() || null,
      team_b_name: input.team_b_name?.trim() || null,
      player_score: input.player_score,
      opponent_score: input.opponent_score,
    })
    .select()
    .single();

  if (error) throw error;

  // Update streak for the person recording the match
  try {
    await updateStreak(input.recorded_by, 'match_recorded');
  } catch (e) {
    console.error('Failed to update streak for match recording:', e);
  }

  return data;
}

export async function fetchCommunityMatches(
  communityId: string,
  userId?: string,
  page?: number,
  pageSize?: number,
): Promise<{ data: CommunityMatch[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc('get_community_matches', {
    p_community_id: communityId,
    p_page: page ?? 1,
    p_page_size: pageSize ?? 20,
    p_user_id: userId ?? null,
  });

  if (error) throw error;

  const rows = data ?? [];
  const hasMore = page && pageSize ? rows.length === pageSize : false;

  return { data: rows.map(rowToMatch), hasMore };
}

export async function fetchCommunityMatchById(
  matchId: string,
  userId?: string,
): Promise<CommunityMatch | null> {
  const { data, error } = await supabase.rpc('get_community_match_by_id', {
    p_match_id: matchId,
    p_user_id: userId ?? null,
  });

  if (error) throw error;
  const row = data?.[0];
  return row ? rowToMatch(row) : null;
}

export async function toggleCommunityMatchLike(
  communityMatchId: string,
  userId: string,
  like: boolean,
): Promise<void> {
  if (like) {
    const { error } = await supabase
      .from('community_match_likes')
      .insert({ community_match_id: communityMatchId, profile_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('community_match_likes')
      .delete()
      .eq('community_match_id', communityMatchId)
      .eq('profile_id', userId);
    if (error) throw error;
  }
}

export async function fetchCommunityMatchComments(
  communityMatchId: string,
): Promise<CommunityMatchComment[]> {
  const { data, error } = await supabase.rpc('get_match_comments', { p_match_id: communityMatchId });
  if (error) throw error;
  return (data ?? []).map(rowToComment);
}

export async function addCommunityMatchComment(
  communityMatchId: string,
  userId: string,
  content: string,
): Promise<CommunityMatchComment> {
  const { data, error } = await supabase
    .from('community_match_comments')
    .insert({
      community_match_id: communityMatchId,
      profile_id: userId,
      content: content.trim(),
    })
    .select('*')
    .single();

  if (error) throw error;

  // Fetch the profile for the new comment
  const { data: profile } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .eq('id', userId)
    .single();

  const comment = {
    ...data,
    profile: profile ?? null,
  };

  return comment;
}

export async function approveCommunityMatch(
  matchId: string,
  actorId: string,
): Promise<void> {
  const { data: match } = await supabase
    .from('community_matches')
    .select('recorded_by, community_id')
    .eq('id', matchId)
    .single();

  if (!match) throw new Error('Match not found');

  const { error } = await supabase
    .from('community_matches')
    .update({ approval_status: 'approved' })
    .eq('id', matchId);

  if (error) throw error;
}

export async function disputeCommunityMatch(
  matchId: string,
  actorId: string,
): Promise<void> {
  const { data: match } = await supabase
    .from('community_matches')
    .select('recorded_by, community_id')
    .eq('id', matchId)
    .single();

  if (!match) throw new Error('Match not found');

  const { error } = await supabase
    .from('community_matches')
    .update({ approval_status: 'disputed' })
    .eq('id', matchId);

  if (error) throw error;
}

export async function promoteToAdmin(
  communityId: string,
  targetUserId: string,
  actorId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .update({ role: 'admin' })
    .eq('community_id', communityId)
    .eq('profile_id', targetUserId);

  if (error) throw error;
}

export async function inviteMemberByUsername(
  communityId: string,
  adminId: string,
  username: string,
): Promise<CommunityInvite> {
  const { data: profile, error: profileError } = await supabase
    .from('public_profiles')
    .select('id, username')
    .eq('username', username.toLowerCase())
    .single();

  if (profileError) {
    if (profileError.code === 'PGRST116') {
      throw new Error('User not found');
    }
    throw profileError;
  }

  const inviteeId = profile.id;

  if (inviteeId === adminId) {
    throw new Error('You cannot invite yourself');
  }

  const { data, error } = await supabase.rpc('create_community_invite', {
    p_community_id: communityId,
    p_invited_by: adminId,
    p_invitee_id: inviteeId,
  });

  if (error) {
    if (error.message.includes('already a member')) {
      throw new Error('User is already a member of this community');
    }
    if (error.message.includes('pending join request')) {
      throw new Error('User already has a pending join request');
    }
    if (error.message.includes('pending invite')) {
      throw new Error('User already has a pending invite');
    }
    throw error;
  }

  const { data: community } = await supabase
    .from('communities')
    .select('name, image_url')
    .eq('id', communityId)
    .single();

  const admin = await fetchProfile(adminId);

  return {
    ...data,
    community: { id: communityId, name: community?.name ?? '', image_url: community?.image_url ?? null },
    inviter: { id: adminId, username: admin?.username ?? 'Unknown', avatar_url: admin?.avatar_url ?? null },
    invitee: { id: inviteeId, username: profile.username, avatar_url: null },
  };
}

export async function fetchPendingInvites(
  communityId: string,
): Promise<CommunityInvite[]> {
  const { data, error } = await supabase.rpc('get_community_invites', { p_community_id: communityId });
  if (error) throw error;
  return (data ?? []).map(rowToInvite);
}

export async function fetchMyPendingInvites(userId: string): Promise<CommunityInvite[]> {
  const { data, error } = await supabase.rpc('get_my_pending_invites');
  if (error) throw error;
  return (data ?? []).map(rowToInvite);
}

export async function respondToInvite(
  inviteId: string,
  status: 'accepted' | 'rejected',
): Promise<void> {
  const { data: invite, error: fetchError } = await supabase
    .from('community_invites')
    .select('community_id, invited_by, invitee_id')
    .eq('id', inviteId)
    .single();

  if (fetchError) throw fetchError;
  if (!invite) throw new Error('Invite not found');

  const { error } = await supabase
    .from('community_invites')
    .update({ status })
    .eq('id', inviteId)
    .eq('status', 'pending');

  if (error) throw error;

  if (status === 'accepted') {
    const { error: memberError } = await supabase
      .from('community_members')
      .insert({
        community_id: invite.community_id,
        profile_id: invite.invitee_id,
        role: 'member',
        approval_status: 'approved',
      });

    if (memberError) throw memberError;
  }
}

export async function cancelInvite(inviteId: string, adminId: string): Promise<void> {
  const { error } = await supabase
    .from('community_invites')
    .delete()
    .eq('id', inviteId)
    .eq('invited_by', adminId)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function inviteToCommunity(
  communityId: string,
  invitedBy: string,
  inviteeId: string,
): Promise<CommunityInvite> {
  const { data, error } = await supabase.rpc('create_community_invite', {
    p_community_id: communityId,
    p_invited_by: invitedBy,
    p_invitee_id: inviteeId,
  });

  if (error) throw error;

  const invite = data[0];

  return invite;
}

export async function fetchCommunityInvites(
  communityId: string,
): Promise<CommunityInvite[]> {
  const { data, error } = await supabase
    .from('community_invites')
    .select('*')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data || data.length === 0) return [];

  // Batch-resolve profiles from public_profiles view
  const profileIds = data.flatMap((r: any) => [r.invited_by, r.invitee_id]);
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length === 0) return data as any[];
  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .in('id', uniqueIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return data.map((row: any) => ({
    ...row,
    inviter: profileMap.get(row.invited_by)
      ? { id: row.invited_by, username: profileMap.get(row.invited_by)!.username, avatar_url: profileMap.get(row.invited_by)!.avatar_url }
      : null,
    invitee: profileMap.get(row.invitee_id)
      ? { id: row.invitee_id, username: profileMap.get(row.invitee_id)!.username, avatar_url: profileMap.get(row.invitee_id)!.avatar_url }
      : null,
  }));
}

export async function fetchUserPendingInvites(userId: string): Promise<CommunityInvite[]> {
  const { data, error } = await supabase
    .from('community_invites')
    .select('*')
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const profileIds = data.flatMap((r: any) => [r.invited_by, r.invitee_id]);
  const uniqueIds = [...new Set(profileIds)];
  if (uniqueIds.length === 0) return data as any[];
  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .in('id', uniqueIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  return data.map((row: any) => ({
    ...row,
    inviter: profileMap.get(row.invited_by)
      ? { id: row.invited_by, username: profileMap.get(row.invited_by)!.username, avatar_url: profileMap.get(row.invited_by)!.avatar_url }
      : null,
    invitee: profileMap.get(row.invitee_id)
      ? { id: row.invitee_id, username: profileMap.get(row.invitee_id)!.username, avatar_url: profileMap.get(row.invitee_id)!.avatar_url }
      : null,
  }));
}

export async function respondToCommunityInvite(
  inviteId: string,
  userId: string,
  accept: boolean,
): Promise<{ community_id: string; invited_by: string; invitee_id: string }> {
  const { data, error } = await supabase.rpc('respond_to_community_invite', {
    p_invite_id: inviteId,
    p_user_id: userId,
    p_accept: accept,
  });

  if (error) throw error;

  return data as { community_id: string; invited_by: string; invitee_id: string };
}

export async function cancelCommunityInvite(
  inviteId: string,
  adminId: string,
): Promise<void> {
  const { error } = await supabase
    .from('community_invites')
    .delete()
    .eq('id', inviteId)
    .eq('invited_by', adminId);

  if (error) throw error;
}

type PostRpcRow = {
  id: string;
  community_id: string;
  author_id: string;
  content: string | null;
  image_url: string | null;
  post_type: string;
  created_at: string;
  updated_at: string;
  author_username: string | null;
  author_avatar_url: string | null;
  likes_count: number;
  comments_count: number;
  is_liked_by_user: boolean;
};

function rowToPost(r: PostRpcRow): CommunityPost {
  return {
    id: r.id,
    community_id: r.community_id,
    author_id: r.author_id,
    content: r.content,
    image_url: r.image_url,
    post_type: r.post_type as CommunityPostType,
    created_at: r.created_at,
    updated_at: r.updated_at,
    author: r.author_username
      ? { id: r.author_id, username: r.author_username, avatar_url: r.author_avatar_url }
      : null,
    likes_count: Number(r.likes_count) ?? 0,
    comments_count: Number(r.comments_count) ?? 0,
    is_liked_by_user: r.is_liked_by_user,
  };
}

type PostCommentRpcRow = {
  id: string;
  post_id: string;
  profile_id: string;
  content: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

function rowToPostComment(r: PostCommentRpcRow): CommunityPostComment {
  return {
    id: r.id,
    post_id: r.post_id,
    profile_id: r.profile_id,
    content: r.content,
    created_at: r.created_at,
    profile: r.username
      ? { id: r.profile_id, username: r.username, avatar_url: r.avatar_url }
      : null,
  };
}

export async function fetchCommunityPosts(
  communityId: string,
  userId?: string,
  page?: number,
  pageSize?: number,
): Promise<{ data: CommunityPost[]; hasMore: boolean }> {
  const { data, error } = await supabase.rpc('get_community_posts', {
    p_community_id: communityId,
    p_user_id: userId ?? null,
    p_page: page ?? 1,
    p_page_size: pageSize ?? 20,
  });

  if (error) throw error;

  const rows = data ?? [];
  const hasMore = page && pageSize ? rows.length === pageSize : false;

  return { data: rows.map(rowToPost), hasMore };
}

export async function fetchCommunityPostById(
  postId: string,
  userId?: string,
): Promise<CommunityPost | null> {
  const { data, error } = await supabase.rpc('get_community_post_by_id', {
    p_post_id: postId,
    p_user_id: userId ?? null,
  });

  if (error) throw error;
  const row = data?.[0];
  return row ? rowToPost(row) : null;
}

export async function createCommunityPost(input: {
  community_id: string;
  author_id: string;
  content?: string | null;
  image_url?: string | null;
  post_type: CommunityPostType;
}): Promise<CommunityPost> {
  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      community_id: input.community_id,
      author_id: input.author_id,
      content: input.content?.trim() || null,
      image_url: input.image_url || null,
      post_type: input.post_type,
    })
    .select()
    .single();

  if (error) throw error;

  const { data: profile } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .eq('id', input.author_id)
    .single();

  return {
    ...data,
    author: profile ?? null,
    likes_count: 0,
    comments_count: 0,
    is_liked_by_user: false,
  };
}

export async function deleteCommunityPost(
  postId: string,
  userId: string,
): Promise<void> {
  const { data: post, error: fetchError } = await supabase
    .from('community_posts')
    .select('author_id, community_id')
    .eq('id', postId)
    .single();

  if (fetchError) throw fetchError;
  if (!post) throw new Error('Post not found');

  const { data: member } = await supabase
    .from('community_members')
    .select('role')
    .eq('community_id', post.community_id)
    .eq('profile_id', userId)
    .single();

  const isAdmin = member?.role === 'admin';
  const isAuthor = post.author_id === userId;

  if (!isAuthor && !isAdmin) {
    throw new Error('Only the author or an admin can delete this post');
  }

  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId);

  if (error) throw error;
}

export async function toggleCommunityPostLike(
  postId: string,
  userId: string,
  like: boolean,
): Promise<void> {
  if (like) {
    const { error } = await supabase
      .from('community_post_likes')
      .insert({ post_id: postId, profile_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('community_post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('profile_id', userId);
    if (error) throw error;
  }
}

export async function fetchCommunityPostComments(
  postId: string,
): Promise<CommunityPostComment[]> {
  const { data, error } = await supabase.rpc('get_community_post_comments', {
    p_post_id: postId,
  });
  if (error) throw error;
  return (data ?? []).map(rowToPostComment);
}

export async function addCommunityPostComment(
  postId: string,
  userId: string,
  content: string,
): Promise<CommunityPostComment> {
  const { data, error } = await supabase
    .from('community_post_comments')
    .insert({
      post_id: postId,
      profile_id: userId,
      content: content.trim(),
    })
    .select('*')
    .single();

  if (error) throw error;

  const { data: profile } = await supabase
    .from('public_profiles')
    .select('id, username, avatar_url')
    .eq('id', userId)
    .single();

  return {
    ...data,
    profile: profile ?? null,
  };
}
