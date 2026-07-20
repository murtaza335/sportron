import { supabase } from '@/lib/supabase';
import type { Session, Commitment, CreateSessionInput } from '@/types';

type SessionRow = Session & {
  creator: { id: string; username: string; avatar_url: string | null } | null;
  commitments: { id: string; user_id: string; status: string }[] | null;
};

function normalizeSession(row: SessionRow, currentUserId?: string): Session {
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
    commitment_count: row.commitments?.filter((c) => c.status === 'accepted').length ?? 0,
    my_commitment: currentUserId
      ? (row.commitments?.find((c) => c.user_id === currentUserId) ??
          null)
      : null,
  };
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
  return (data ?? []).map((row) => normalizeSession(row as SessionRow, currentUserId));
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
  return data ? normalizeSession(data as SessionRow, currentUserId) : null;
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
      profile:profiles!commitments_user_id_fkey (id, username, avatar_url)
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
      status: 'accepted',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function uncommitFromSession(sessionId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('commitments')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId);

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
  return (data ?? []).map((row) => normalizeSession(row as SessionRow, userId));
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
  return (conflicts ?? []).map((row) => normalizeSession(row as SessionRow, userId));
}
