import { supabase } from '@/lib/supabase';
import type {
  Community,
  CommunityInvite,
  Profile,
  CommunityJoinRequest,
  CommunityMatch,
  CommunityMatchComment,
  CommunityMember,
  CommunityMemberRole,
  CreateCommunityInput,
  Ping,
  PingResponse,
  Sport,
  UpdateCommunityInput,
} from '@/types';
import { fetchProfile } from './profiles';
import {
  notifyJoinRequest,
  notifyJoinApproved,
  notifyJoinRejected,
  notifyPing,
  notifyPingResponse,
  notifyMemberRemoved,
  notifyPromotedToAdmin,
  notifyAdminTransferred,
  notifyCommunityMatchPending,
  notifyCommunityMatchApproved,
  notifyCommunityMatchDisputed,
  notifyCommunityMatchLiked,
  notifyCommunityMatchCommented,
  notifyCommunityInvite,
  notifyCommunityInviteResponse,
} from './notifications';

type CommunityRow = Community & {
  member_count: { count: number }[] | null;
  creator?: { id: string; username: string } | null;
};

function normalizeCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    organization: row.organization,
    location: row.location,
    image_url: row.image_url,
    visibility: row.visibility,
    sport: row.sport,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    member_count: row.member_count?.[0]?.count ?? 0,
    creator: Array.isArray(row.creator) ? row.creator[0] ?? null : row.creator ?? null,
  };
}

export async function fetchPublicCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from('communities')
    .select(`
      *,
      member_count:community_members(count),
      creator:created_by(id, username)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => normalizeCommunity(row as CommunityRow));
}

export async function fetchMyCommunities(userId: string): Promise<Community[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select(`
      community:community_id(
        *,
        member_count:community_members(count),
        creator:created_by(id, username)
      )
    `)
    .eq('profile_id', userId)
    .eq('approval_status', 'approved');

  if (error) throw error;

  const communities: Community[] = [];
  for (const row of data ?? []) {
    const c = (row as Record<string, unknown>).community as CommunityRow | undefined;
    if (c) communities.push(normalizeCommunity(c));
  }

  return communities;
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
  const { data, error } = await supabase
    .from('communities')
    .select(`
      *,
      member_count:community_members(count),
      creator:created_by(id, username)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? normalizeCommunity(data as CommunityRow) : null;
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

export async function updateCommunity(
  communityId: string,
  input: UpdateCommunityInput,
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() || null;
  if (input.organization !== undefined) updates.organization = input.organization?.trim() || null;
  if (input.location !== undefined) updates.location = input.location?.trim() || null;
  if (input.visibility !== undefined) updates.visibility = input.visibility;
  if (input.image_url !== undefined) updates.image_url = input.image_url;

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

export async function deleteCommunity(communityId: string): Promise<void> {
  const { error } = await supabase
    .from('communities')
    .delete()
    .eq('id', communityId);

  if (error) throw error;
}

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select(`
      *,
      profile:profile_id(id, username, display_name, avatar_url)
    `)
    .eq('community_id', communityId);

  if (error) throw error;
  return data ?? [];
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

  try {
    const requester = await fetchProfile(userId);
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community) {
      const { data: admins } = await supabase
        .from('community_members')
        .select('profile_id')
        .eq('community_id', communityId)
        .eq('role', 'admin');

      const adminIds = (admins ?? []).map((a) => a.profile_id);
      if (adminIds.length > 0) {
        await notifyJoinRequest(
          adminIds,
          communityId,
          community.name,
          requester?.username ?? 'Someone',
          userId,
        );
      }
    }
  } catch (e) {
    console.error('Failed to send join request notification:', e);
  }
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

  try {
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community) {
      await notifyMemberRemoved(profileId, communityId, community.name);
    }
  } catch (e) {
    console.error('Failed to send removal notification:', e);
  }
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

  try {
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community) {
      const currentUser = await fetchProfile(currentUserId);
      await notifyAdminTransferred(
        newAdminId,
        communityId,
        community.name,
        currentUser?.username ?? 'Previous admin',
      );
    }
  } catch (e) {
    console.error('Failed to send admin transfer notification:', e);
  }
}

export async function fetchJoinRequests(
  communityId: string,
): Promise<CommunityJoinRequest[]> {
  const { data, error } = await supabase
    .from('community_join_requests')
    .select(`
      *,
      profile:user_id(id, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
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

  try {
    await supabase
      .from('in_app_notifications')
      .update({
        type: status === 'approved' ? 'join_approved' : 'join_rejected',
        read: true,
      })
      .eq('type', 'join_request')
      .eq('data->>communityId', request.community_id)
      .eq('data->>requesterId', request.user_id);
  } catch (e) {
    console.error('Failed to resolve join request notification:', e);
  }

  try {
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', request.community_id)
      .single();

    if (community) {
      if (status === 'approved') {
        await notifyJoinApproved(request.user_id, request.community_id, community.name);
      } else {
        await notifyJoinRejected(request.user_id, request.community_id, community.name);
      }
    }
  } catch (e) {
    console.error('Failed to send join response notification:', e);
  }
}

export async function sendPing(
  communityId: string,
  senderId: string,
  message: string,
): Promise<string> {
  const { data: ping, error } = await supabase
    .from('pings')
    .insert({
      community_id: communityId,
      sender_id: senderId,
      message: message.trim(),
    })
    .select('id')
    .single();

  if (error) throw error;

  try {
    const sender = await fetchProfile(senderId);
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community) {
      const { data: members } = await supabase
        .from('community_members')
        .select('profile_id')
        .eq('community_id', communityId)
        .eq('approval_status', 'approved')
        .neq('profile_id', senderId);

      const memberIds = (members ?? []).map((m) => m.profile_id);
      if (memberIds.length > 0) {
        await notifyPing(
          memberIds,
          communityId,
          community.name,
          sender?.username ?? 'Someone',
          message.trim(),
          ping.id,
        );
      }
    }
  } catch (e) {
    console.error('Failed to send ping notifications:', e);
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

export async function respondToPing(
  pingId: string,
  communityId: string,
  respondentId: string,
  response: 'coming' | 'busy',
): Promise<void> {
  const { error } = await supabase
    .from('ping_responses')
    .insert({
      ping_id: pingId,
      community_id: communityId,
      respondent_id: respondentId,
      response,
    });

  if (error) throw error;

  try {
    const respondent = await fetchProfile(respondentId);
    const { data: ping } = await supabase
      .from('pings')
      .select('sender_id, message')
      .eq('id', pingId)
      .single();

    if (ping && respondent) {
      await notifyPingResponse(
        ping.sender_id,
        pingId,
        communityId,
        respondent?.username ?? 'Someone',
        response,
        ping.message,
      );
    }
  } catch (e) {
    console.error('Failed to send ping response notification:', e);
  }
}

export async function fetchPingResponses(pingId: string): Promise<PingResponse[]> {
  const { data, error } = await supabase
    .from('ping_responses')
    .select(`
      *,
      respondent:respondent_id(id, username, display_name, avatar_url)
    `)
    .eq('ping_id', pingId)
    .order('created_at', { ascending: true });

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

  try {
    if (input.opponent_id !== input.recorded_by) {
      const recorder = await fetchProfile(input.recorded_by);
      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', input.community_id)
        .single();

      if (community) {
        await notifyCommunityMatchPending(
          input.opponent_id,
          data.id,
          recorder?.username ?? 'Someone',
          community.name,
        );
      }
    }
  } catch (e) {
    console.error('Failed to send community match notification:', e);
  }

  return data;
}

export async function fetchCommunityMatches(
  communityId: string,
  userId?: string,
  page?: number,
  pageSize?: number,
): Promise<{ data: CommunityMatch[]; hasMore: boolean }> {
  let query = supabase
    .from('community_matches')
    .select(`
      *,
      recorder:recorded_by(id, username),
      player:player_id(id, username),
      playerPartner:player_partner_id(id, username),
      opponent:opponent_id(id, username),
      opponentPartner:opponent_partner_id(id, username),
      likes:community_match_likes(profile_id),
      comments:community_match_comments(id)
    `)
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  // Filter out pending matches that don't involve the current user
  if (userId) {
    query = query.or(`approval_status.neq.pending,recorded_by.eq.${userId},opponent_id.eq.${userId}`);
  }

  if (page && pageSize) {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    query = query.range(from, to);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = data ?? [];
  const hasMore = page && pageSize ? rows.length === pageSize : false;

  const matches = rows.map((row: any) => {
    const likes = row.likes ?? [];
    const comments = row.comments ?? [];
    return {
      ...row,
      player: Array.isArray(row.player) ? row.player[0] ?? null : row.player,
      playerPartner: Array.isArray(row.playerPartner) ? row.playerPartner[0] ?? null : row.playerPartner,
      opponent: Array.isArray(row.opponent) ? row.opponent[0] ?? null : row.opponent,
      opponentPartner: Array.isArray(row.opponentPartner) ? row.opponentPartner[0] ?? null : row.opponentPartner,
      recorder: Array.isArray(row.recorder) ? row.recorder[0] ?? null : row.recorder,
      likes_count: likes.length,
      comments_count: comments.length,
      is_liked_by_user: userId ? likes.some((like: { profile_id: string }) => like.profile_id === userId) : false,
    } as CommunityMatch;
  });

  return { data: matches, hasMore };
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

    try {
      const { data: match } = await supabase
        .from('community_matches')
        .select('recorded_by')
        .eq('id', communityMatchId)
        .single();

      if (match && match.recorded_by !== userId) {
        const liker = await fetchProfile(userId);
        await notifyCommunityMatchLiked(match.recorded_by, communityMatchId, liker?.username ?? 'Someone');
      }
    } catch (e) {
      console.error('Failed to send community match like notification:', e);
    }
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
  const { data, error } = await supabase
    .from('community_match_comments')
    .select(`
      *,
      profile:profiles(id, username)
    `)
    .eq('community_match_id', communityMatchId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    ...row,
    profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile,
  }));
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
    .select(`
      *,
      profile:profiles(id, username)
    `)
    .single();

  if (error) throw error;

  const row = data as any;
  const comment = {
    ...row,
    profile: Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile,
  };

  try {
    const { data: match } = await supabase
      .from('community_matches')
      .select('recorded_by')
      .eq('id', communityMatchId)
      .single();

    if (match && match.recorded_by !== userId) {
      await notifyCommunityMatchCommented(
        match.recorded_by,
        communityMatchId,
        comment.profile?.username ?? 'Someone',
        comment.id,
      );
    }
  } catch (e) {
    console.error('Failed to send community match comment notification:', e);
  }

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

  try {
    await supabase
      .from('in_app_notifications')
      .update({ type: 'community_match_approved', read: true })
      .eq('type', 'community_match_pending')
      .eq('data->>matchId', matchId);
  } catch (e) {
    console.error('Failed to resolve community match notification:', e);
  }

  try {
    if (match.recorded_by !== actorId) {
      const actor = await fetchProfile(actorId);
      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', match.community_id)
        .single();

      if (community) {
        await notifyCommunityMatchApproved(
          match.recorded_by,
          matchId,
          actor?.username ?? 'Someone',
          community.name,
        );
      }
    }
  } catch (e) {
    console.error('Failed to send match approval notification:', e);
  }
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

  try {
    await supabase
      .from('in_app_notifications')
      .update({ type: 'community_match_disputed', read: true })
      .eq('type', 'community_match_pending')
      .eq('data->>matchId', matchId);
  } catch (e) {
    console.error('Failed to resolve community match notification:', e);
  }

  try {
    if (match.recorded_by !== actorId) {
      const actor = await fetchProfile(actorId);
      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', match.community_id)
        .single();

      if (community) {
        await notifyCommunityMatchDisputed(
          match.recorded_by,
          matchId,
          actor?.username ?? 'Someone',
          community.name,
        );
      }
    }
  } catch (e) {
    console.error('Failed to send match dispute notification:', e);
  }
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

  try {
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community) {
      const actor = await fetchProfile(actorId);
      await notifyPromotedToAdmin(
        targetUserId,
        communityId,
        community.name,
        actor?.username ?? 'An admin',
      );
    }
  } catch (e) {
    console.error('Failed to send promotion notification:', e);
  }
}

type InviteRow = CommunityInvite & {
  community: Pick<Community, 'id' | 'name' | 'image_url'> | null;
  inviter: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
  invitee: Pick<Profile, 'id' | 'username' | 'avatar_url'> | null;
};

function normalizeInvite(row: InviteRow): CommunityInvite {
  return {
    id: row.id,
    community_id: row.community_id,
    invited_by: row.invited_by,
    invitee_id: row.invitee_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    community: row.community,
    inviter: row.inviter,
    invitee: row.invitee,
  };
}

export async function inviteMemberByUsername(
  communityId: string,
  adminId: string,
  username: string,
): Promise<CommunityInvite> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
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

  if (community && admin) {
    await notifyCommunityInvite(inviteeId, communityId, community.name, admin.username, data.id);
  }

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
  const { data, error } = await supabase
    .from('community_invites')
    .select(`
      *,
      community:community_id(id, name, image_url),
      inviter:invited_by(id, username, avatar_url),
      invitee:invitee_id(id, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeInvite);
}

export async function fetchMyPendingInvites(userId: string): Promise<CommunityInvite[]> {
  const { data, error } = await supabase
    .from('community_invites')
    .select(`
      *,
      community:community_id(id, name, image_url),
      inviter:invited_by(id, username, avatar_url),
      invitee:invitee_id(id, username, avatar_url)
    `)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map(normalizeInvite);
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

  const { data: community } = await supabase
    .from('communities')
    .select('name')
    .eq('id', invite.community_id)
    .single();

  const invitee = await fetchProfile(invite.invitee_id);

  if (community && invitee) {
    await notifyCommunityInviteResponse(
      invite.invited_by,
      invite.community_id,
      community.name,
      invitee.username,
      status === 'accepted',
    );
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

  try {
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single();

    if (community) {
      const inviter = await fetchProfile(invitedBy);
      await notifyCommunityInvite(
        inviteeId,
        communityId,
        community.name,
        inviter?.username ?? 'Someone',
        invite.id,
      );
    }
  } catch (e) {
    console.error('Failed to send community invite notification:', e);
  }

  return invite;
}

export async function fetchCommunityInvites(
  communityId: string,
): Promise<CommunityInvite[]> {
  const { data, error } = await supabase
    .from('community_invites')
    .select(`
      *,
      community:communities(id, name, image_url),
      inviter:profiles!community_invites_invited_by_fkey(id, username, avatar_url),
      invitee:profiles!community_invites_invitee_id_fkey(id, username, avatar_url)
    `)
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function fetchUserPendingInvites(userId: string): Promise<CommunityInvite[]> {
  const { data, error } = await supabase
    .from('community_invites')
    .select(`
      *,
      community:communities(id, name, image_url),
      inviter:profiles!community_invites_invited_by_fkey(id, username, avatar_url),
      invitee:profiles!community_invites_invitee_id_fkey(id, username, avatar_url)
    `)
    .eq('invitee_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
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

  try {
    const invite = data as { community_id: string; invited_by: string; invitee_id: string };
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', invite.community_id)
      .single();

    if (community) {
      const invitee = await fetchProfile(userId);
      await notifyCommunityInviteResponse(
        invite.invited_by,
        invite.community_id,
        community.name,
        invitee?.username ?? 'Someone',
        accept,
      );
    }
  } catch (e) {
    console.error('Failed to send invite response notification:', e);
  }

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
