import { supabase } from '@/lib/supabase';
import type {
  Community,
  CommunityJoinRequest,
  CommunityMatch,
  CommunityMember,
  CommunityMemberRole,
  CreateCommunityInput,
  Ping,
  Sport,
  UpdateCommunityInput,
} from '@/types';
import { fetchProfile } from './profiles';
import {
  notifyJoinRequest,
  notifyJoinApproved,
  notifyJoinRejected,
  notifyPing,
  notifyMemberRemoved,
  notifyAdminTransferred,
  notifyCommunityMatchPending,
  notifyCommunityMatchApproved,
  notifyCommunityMatchDisputed,
} from './notifications';

type CommunityRow = Community & {
  member_count: { count: number }[] | null;
};

function normalizeCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    visibility: row.visibility,
    sport: row.sport,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    member_count: row.member_count?.[0]?.count ?? 0,
  };
}

export async function fetchPublicCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from('communities')
    .select(`
      *,
      member_count:community_members(count)
    `)
    .eq('visibility', 'public')
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
        member_count:community_members(count)
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
      member_count:community_members(count)
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
      visibility: input.visibility,
      sport: input.sport,
      image_url: input.image_url || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

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
  if (input.visibility !== undefined) updates.visibility = input.visibility;
  if (input.image_url !== undefined) updates.image_url = input.image_url;

  const { error } = await supabase
    .from('communities')
    .update(updates)
    .eq('id', communityId);

  if (error) throw error;
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
): Promise<void> {
  const { error } = await supabase
    .from('pings')
    .insert({
      community_id: communityId,
      sender_id: senderId,
      message: message.trim(),
    });

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
        );
      }
    }
  } catch (e) {
    console.error('Failed to send ping notifications:', e);
  }
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
): Promise<CommunityMatch[]> {
  let query = supabase
    .from('community_matches')
    .select(`
      *,
      recorder:recorded_by(id, username),
      player:player_id(id, username),
      opponent:opponent_id(id, username)
    `)
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });

  // Filter out pending matches that don't involve the current user
  if (userId) {
    query = query.or(`approval_status.neq.pending,recorded_by.eq.${userId},opponent_id.eq.${userId}`);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
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
