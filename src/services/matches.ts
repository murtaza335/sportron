import { supabase } from '@/lib/supabase';
import type { CreateMatchInput, Match, MatchStats, MatchWithProfiles, MatchComment, MatchFormat, Sport } from '@/types';
import { fetchProfile } from './profiles';
import { notifyMatchPending, notifyMatchApproved, notifyMatchRejected, notifyMatchLiked, notifyMatchCommented } from './notifications';

type MatchRow = Match & {
  player: { id: string; username: string } | { id: string; username: string }[] | null;
  playerPartner:
    | { id: string; username: string }
    | { id: string; username: string }[]
    | null;
  opponent: { id: string; username: string } | { id: string; username: string }[] | null;
  opponentPartner:
    | { id: string; username: string }
    | { id: string; username: string }[]
    | null;
  likes: { profile_id: string }[] | null;
  comments: { id: string }[] | null;
  team_a_name: string | null;
  team_b_name: string | null;
};

function normalizeMatch(row: MatchRow, currentUserId?: string): MatchWithProfiles {
  const player = Array.isArray(row.player) ? row.player[0] ?? null : row.player;
  const playerPartner = Array.isArray(row.playerPartner)
    ? row.playerPartner[0] ?? null
    : row.playerPartner;
  const opponent = Array.isArray(row.opponent) ? row.opponent[0] ?? null : row.opponent;
  const opponentPartner = Array.isArray(row.opponentPartner)
    ? row.opponentPartner[0] ?? null
    : row.opponentPartner;

  const likes = row.likes ?? [];
  const comments = row.comments ?? [];

  return {
    id: row.id,
    created_by: row.created_by,
    player_id: row.player_id,
    player_partner_id: row.player_partner_id,
    opponent_id: row.opponent_id,
    opponent_partner_id: row.opponent_partner_id,
    opponent_guest_name: row.opponent_guest_name,
    match_format: row.match_format,
    sport: row.sport,
    custom_sport_name: row.custom_sport_name,
    team_a_name: row.team_a_name ?? null,
    team_b_name: row.team_b_name ?? null,
    player_score: row.player_score,
    opponent_score: row.opponent_score,
    is_public: row.is_public,
    verification_status: row.verification_status,
    created_at: row.created_at,
    player,
    playerPartner,
    opponent,
    opponentPartner,
    likes_count: likes.length,
    comments_count: comments.length,
    is_liked_by_user: currentUserId ? likes.some((like) => like.profile_id === currentUserId) : false,
  };
}

export async function fetchGlobalMatches(currentUserId?: string): Promise<MatchWithProfiles[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      player:profiles!matches_player_id_fkey (id, username),
      playerPartner:profiles!matches_player_partner_id_fkey (id, username),
      opponent:profiles!matches_opponent_id_fkey (id, username),
      opponentPartner:profiles!matches_opponent_partner_id_fkey (id, username),
      likes:match_likes (profile_id),
      comments:match_comments (id)
    `,
    )
    .eq('is_public', true)
    .eq('verification_status', 'verified')
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => normalizeMatch(row as MatchRow, currentUserId));
}

export async function fetchMyMatches(userId: string): Promise<MatchWithProfiles[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      player:profiles!matches_player_id_fkey (id, username),
      playerPartner:profiles!matches_player_partner_id_fkey (id, username),
      opponent:profiles!matches_opponent_id_fkey (id, username),
      opponentPartner:profiles!matches_opponent_partner_id_fkey (id, username),
      likes:match_likes (profile_id),
      comments:match_comments (id)
    `,
    )
    .or(`player_id.eq.${userId},player_partner_id.eq.${userId},opponent_id.eq.${userId},opponent_partner_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => normalizeMatch(row as MatchRow, userId));
}

export async function createMatch(userId: string, input: CreateMatchInput): Promise<Match> {
  const verification_status = (input.opponentId || input.opponentPartnerId) ? 'pending' : 'verified';

  const { data, error } = await supabase
    .from('matches')
    .insert({
      created_by: userId,
      player_id: userId,
      player_partner_id: input.playerPartnerId,
      opponent_id: input.opponentId,
      opponent_partner_id: input.opponentPartnerId,
      opponent_guest_name: null,
      match_format: input.matchFormat,
      sport: input.sport,
      custom_sport_name: input.customSportName?.trim() || null,
      team_a_name: input.teamAName?.trim() || null,
      team_b_name: input.teamBName?.trim() || null,
      player_score: input.playerScore,
      opponent_score: input.opponentScore,
      is_public: input.isPublic,
      verification_status,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  try {
    const creator = await fetchProfile(userId);

    const notified = new Set<string>();
    const opponentIds = [input.opponentId, input.opponentPartnerId].filter(Boolean) as string[];
    for (const id of opponentIds) {
      if (!notified.has(id)) {
        notified.add(id);
        await notifyMatchPending(id, data.id, creator?.username ?? 'Someone');
      }
    }
  } catch (e) {
    console.error('Failed to send match notifications:', e);
  }

  return data;
}

export async function updateMatchVerificationStatus(
  matchId: string,
  status: 'verified' | 'disputed',
  actorId: string
): Promise<void> {
  const { data: match } = await supabase
    .from('matches')
    .select('created_by')
    .eq('id', matchId)
    .single();

  const { error } = await supabase
    .from('matches')
    .update({ verification_status: status })
    .eq('id', matchId);

  if (error) {
    throw error;
  }

  try {
    if (match && match.created_by !== actorId) {
      const actor = await fetchProfile(actorId);
      const name = actor?.username ?? 'Someone';

      if (status === 'verified') {
        await notifyMatchApproved(match.created_by, matchId, name);
      } else {
        await notifyMatchRejected(match.created_by, matchId, name);
      }
    }
  } catch (e) {
    console.error('Failed to send verification notification:', e);
  }
}

export async function fetchMatchStats(userId: string): Promise<MatchStats> {
  const { data, error } = await supabase
    .from('matches')
    .select('player_id, player_partner_id, opponent_id, opponent_partner_id, player_score, opponent_score')
    .eq('verification_status', 'verified')
    .or(`player_id.eq.${userId},player_partner_id.eq.${userId},opponent_id.eq.${userId},opponent_partner_id.eq.${userId}`);

  if (error) {
    throw error;
  }

  const matches = data ?? [];
  let wins = 0;
  let losses = 0;

  for (const match of matches) {
    const isPlayerTeam = match.player_id === userId || match.player_partner_id === userId;
    const isOpponentTeam = match.opponent_id === userId || match.opponent_partner_id === userId;

    if (match.player_score === match.opponent_score) {
      continue;
    }

    if (isPlayerTeam) {
      if (match.player_score > match.opponent_score) {
        wins += 1;
      } else {
        losses += 1;
      }
    } else if (isOpponentTeam) {
      if (match.opponent_score > match.player_score) {
        wins += 1;
      } else {
        losses += 1;
      }
    }
  }

  return {
    total: matches.length,
    wins,
    losses,
  };
}

export async function toggleLike(matchId: string, userId: string, like: boolean): Promise<void> {
  if (like) {
    const { error } = await supabase
      .from('match_likes')
      .insert({ match_id: matchId, profile_id: userId });
    if (error) throw error;

    const { data: match } = await supabase
      .from('matches')
      .select('created_by')
      .eq('id', matchId)
      .single();

    try {
      if (match && match.created_by !== userId) {
        const liker = await fetchProfile(userId);
        await notifyMatchLiked(match.created_by, matchId, liker?.username ?? 'Someone');
      }
    } catch (e) {
      console.error('Failed to send like notification:', e);
    }
  } else {
    const { error } = await supabase
      .from('match_likes')
      .delete()
      .eq('match_id', matchId)
      .eq('profile_id', userId);
    if (error) throw error;
  }
}

export async function fetchComments(matchId: string): Promise<MatchComment[]> {
  type CommentRow = {
    id: string;
    match_id: string;
    profile_id: string;
    content: string;
    created_at: string;
    profile: { username: string } | { username: string }[] | null;
  };

  const { data, error } = await supabase
    .from('match_comments')
    .select(`
      *,
      profile:profiles (username)
    `)
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => {
    const r = row as CommentRow;
    const profile = Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile;
    return {
      id: r.id,
      match_id: r.match_id,
      profile_id: r.profile_id,
      content: r.content,
      created_at: r.created_at,
      profile,
    };
  });
}

export async function addComment(matchId: string, userId: string, content: string): Promise<MatchComment> {
  const { data, error } = await supabase
    .from('match_comments')
    .insert({
      match_id: matchId,
      profile_id: userId,
      content: content.trim(),
    })
    .select(`
      *,
      profile:profiles (username)
    `)
    .single();

  if (error) {
    throw error;
  }

  const row = data as any;
  const profile = Array.isArray(row.profile) ? row.profile[0] ?? null : row.profile;

  try {
    const { data: match } = await supabase
      .from('matches')
      .select('created_by')
      .eq('id', matchId)
      .single();

    if (match && match.created_by !== userId) {
      await notifyMatchCommented(
        match.created_by,
        matchId,
        profile?.username ?? 'Someone',
        row.id,
      );
    }
  } catch (e) {
    console.error('Failed to send comment notification:', e);
  }

  return {
    id: row.id,
    match_id: row.match_id,
    profile_id: row.profile_id,
    content: row.content,
    created_at: row.created_at,
    profile,
  };
}

export async function deleteMatch(matchId: string): Promise<void> {
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('id', matchId);

  if (error) {
    throw error;
  }
}

export async function fetchPendingApprovalMatches(userId: string): Promise<MatchWithProfiles[]> {
  const { data, error } = await supabase
    .from('matches')
    .select(
      `
      *,
      player:profiles!matches_player_id_fkey (id, username),
      playerPartner:profiles!matches_player_partner_id_fkey (id, username),
      opponent:profiles!matches_opponent_id_fkey (id, username),
      opponentPartner:profiles!matches_opponent_partner_id_fkey (id, username),
      likes:match_likes (profile_id),
      comments:match_comments (id)
    `,
    )
    .eq('verification_status', 'pending')
    .or(`opponent_id.eq.${userId},opponent_partner_id.eq.${userId}`)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  const matches = data ?? [];
  
  // Normalize row matching the local type signature
  type CommentLikesRow = {
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
    player: { id: string; username: string } | { id: string; username: string }[] | null;
    playerPartner: { id: string; username: string } | { id: string; username: string }[] | null;
    opponent: { id: string; username: string } | { id: string; username: string }[] | null;
    opponentPartner: { id: string; username: string } | { id: string; username: string }[] | null;
    likes: { profile_id: string }[] | null;
    comments: { id: string }[] | null;
  };

  return (matches as any[]).map((row) => normalizeMatch(row as CommentLikesRow, userId));
}
