import { supabase } from '@/lib/supabase';
import type { Session, Commitment, CreateSessionInput } from '@/types';

type SessionRow = Session & {
  creator: { id: string; username: string; avatar_url: string | null } | null;
  commitments: { id: string; user_id: string; status: string }[] | null;
};

function normalizeSession(
  row: SessionRow,
  currentUserId?: string,
  acceptedCount?: number,
): Session {
  return {
    id: row.id,
    created_by: row.created_by,
    sport: row.sport,
    location: row.location,
    date_time: row.date_time,
    max_participants: row.max_participants,
    description: row.description,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    creator: row.creator,
    commitment_count: acceptedCount ?? 0,
    my_commitment: currentUserId
      ? ((row.commitments?.find((c) => c.user_id === currentUserId) as Pick<Commitment, 'id' | 'status'> | undefined) ?? null)
      : null,
  };
}

async function fetchAcceptedCounts(sessionIds: string[]): Promise<Record<string, number>> {
  if (sessionIds.length === 0) return {};
  const { data } = await supabase.rpc('get_accepted_commitment_counts', {
    p_session_ids: sessionIds,
  });
  const map: Record<string, number> = {};
  if (data) {
    for (const item of data) {
      map[item.session_id] = Number(item.count);
    }
  }
  return map;
}

export async function fetchOpenSessions(currentUserId?: string): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .in('status', ['open', 'full'])
    .order('date_time', { ascending: true });

  if (error) throw error;

  const sessions = data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const countMap = await fetchAcceptedCounts(sessionIds);

  return sessions.map((row) =>
    normalizeSession(row as SessionRow, currentUserId, countMap[row.id] ?? 0),
  );
}

export async function fetchSessionById(
  id: string,
  currentUserId?: string,
): Promise<Session | null> {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  let acceptedCount = 0;
  if (data) {
    const countMap = await fetchAcceptedCounts([data.id]);
    acceptedCount = countMap[data.id] ?? 0;
  }

  return data ? normalizeSession(data as SessionRow, currentUserId, acceptedCount) : null;
}

export async function createSession(
  userId: string,
  input: CreateSessionInput,
): Promise<Session> {
  const { data, error } = await supabase
    .from('sessions')
    .insert({
      created_by: userId,
      sport: input.sport.trim(),
      location: input.location.trim(),
      date_time: input.date_time,
      max_participants: input.max_participants,
      description: input.description?.trim() || null,
      status: 'open',
    })
    .select()
    .single();

  if (error) throw error;
  return { ...data, commitment_count: 0 };
}

export async function fetchSessionCommitments(
  sessionId: string,
): Promise<Commitment[]> {
  const { data, error } = await supabase
    .from('commitments')
    .select(
      `
      *,
      profile:profiles!commitments_user_id_fkey (
        id, username, avatar_url,
        completed_sessions, total_committed_sessions
      )
    `,
    )
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function commitToSession(
  sessionId: string,
  userId: string,
): Promise<Commitment> {
  const { data, error } = await supabase
    .from('commitments')
    .insert({
      session_id: sessionId,
      user_id: userId,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function approveCommitment(
  commitmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('commitments')
    .update({ status: 'accepted' })
    .eq('id', commitmentId);

  if (error) throw error;
}

export async function rejectCommitment(
  commitmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from('commitments')
    .update({ status: 'rejected' })
    .eq('id', commitmentId);

  if (error) throw error;
}

export async function uncommitFromSession(sessionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('commitments')
    .update({ status: 'left' })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .in('status', ['pending', 'accepted']);

  if (error) throw error;
}

export async function fetchUserSessions(
  userId: string,
): Promise<Session[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .or(
      `created_by.eq.${userId},and(status.in.(open,full),id.in.(select session_id from commitments where user_id.eq.${userId} and status.eq.accepted))`,
    )
    .order('date_time', { ascending: true });

  if (error) throw error;

  const sessions = data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const countMap = await fetchAcceptedCounts(sessionIds);

  return sessions.map((row) =>
    normalizeSession(row as SessionRow, userId, countMap[row.id] ?? 0),
  );
}

export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  // Check if any accepted commitments exist
  const { count, error: countError } = await supabase
    .from('commitments')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'accepted');

  if (countError) throw countError;
  if (count && count > 0) {
    throw new Error(
      `Cannot delete session — ${count} participant${count > 1 ? 's have' : ' has'} already been accepted.`,
    );
  }

  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId)
    .eq('created_by', userId);

  if (error) throw error;
}

export async function checkTimeConflicts(
  userId: string,
  dateTime: string,
): Promise<Session[]> {
  const minutes = 30;
  const targetTime = new Date(dateTime).getTime();
  const startWindow = new Date(targetTime - minutes * 60 * 1000).toISOString();
  const endWindow = new Date(targetTime + minutes * 60 * 1000).toISOString();

  const { data: createdSessions, error: err1 } = await supabase
    .from('sessions')
    .select('id')
    .eq('created_by', userId)
    .gte('date_time', startWindow)
    .lte('date_time', endWindow);

  if (err1) throw err1;

  const { data: committedSessionIds, error: err2 } = await supabase
    .from('commitments')
    .select('session_id')
    .eq('user_id', userId)
    .eq('status', 'accepted');

  if (err2) throw err2;

  const committedIds = committedSessionIds?.map((c) => c.session_id) ?? [];
  const createdIds = createdSessions?.map((s) => s.id) ?? [];
  const allIds = [...new Set([...committedIds, ...createdIds])];

  if (allIds.length === 0) return [];

  const { data: conflicts, error: err3 } = await supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .in('id', allIds)
    .gte('date_time', startWindow)
    .lte('date_time', endWindow);

  if (err3) throw err3;

  const sessionIds = (conflicts ?? []).map((s) => s.id);
  const countMap = await fetchAcceptedCounts(sessionIds);

  return (conflicts ?? []).map((row) =>
    normalizeSession(row as SessionRow, userId, countMap[row.id] ?? 0),
  );
}
