import { supabase } from '@/lib/supabase';
import type { Session, Commitment, CreateSessionInput, FeedbackStatus } from '@/types';
import { MAX_SESSION_TITLE_LENGTH } from '@/types';
import { fetchProfile } from './profiles';
import { formatSessionDisplayName } from '@/lib/date';
import {
  notifySessionApplication,
  notifySessionAccepted,
  notifySessionRejected,
  notifySessionLeft,
} from './notifications';

type SessionRow = Session & {
  creator: { id: string; username: string; avatar_url: string | null } | null;
  commitments: { id: string; user_id: string; status: string }[] | null;
};

// Coalesces the close_expired_sessions RPC + notification cleanup across the
// screens that call it on every focus (session feed scopes, pending feedback,
// sessions/popups). Multiple calls inside a window collapse into one.
let lastCloseExpiredAt = 0;
const CLOSE_EXPIRED_MIN_INTERVAL_MS = 15_000;

function normalizeSession(
  row: SessionRow,
  currentUserId?: string,
  acceptedCount?: number,
): Session {
  return {
    id: row.id,
    created_by: row.created_by,
    purpose: row.purpose,
    title: row.title,
    location: row.location,
    date_time: row.date_time,
    expires_at: row.expires_at,
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
  await closeExpiredSessions(currentUserId);

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
  await closeExpiredSessions(currentUserId);

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

// Sorts sessions so active ones (open/full) appear first (soonest first),
// then past ones (most recent first). Used by "My" and "Joined" scopes.
function sortActiveFirst(sessions: Session[]): Session[] {
  const active = sessions
    .filter((s) => s.status === 'open' || s.status === 'full')
    .sort((a, b) => new Date(a.date_time).getTime() - new Date(b.date_time).getTime());
  const past = sessions
    .filter((s) => s.status !== 'open' && s.status !== 'full')
    .sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime());
  return [...active, ...past];
}

// Sessions created by the user — active (open/full) first, then ended ones.
export async function fetchMySessions(userId: string): Promise<Session[]> {
  await closeExpiredSessions(userId);

  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .eq('created_by', userId);

  if (error) throw error;

  const sessions = data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const countMap = await fetchAcceptedCounts(sessionIds);

  return sortActiveFirst(
    sessions.map((row) =>
      normalizeSession(row as SessionRow, userId, countMap[row.id] ?? 0),
    ),
  );
}

// Sessions the user has an accepted commitment on — active first, then ended.
export async function fetchJoinedSessions(userId: string): Promise<Session[]> {
  await closeExpiredSessions(userId);

  const { data: committedRows, error: committedError } = await supabase
    .from('commitments')
    .select('session_id')
    .eq('user_id', userId)
    .eq('status', 'accepted');

  if (committedError) throw committedError;

  const committedIds = (committedRows ?? []).map((c) => c.session_id);
  if (committedIds.length === 0) return [];

  const { data, error } = await supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .in('id', committedIds);

  if (error) throw error;

  const sessions = data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const countMap = await fetchAcceptedCounts(sessionIds);

  return sortActiveFirst(
    sessions.map((row) =>
      normalizeSession(row as SessionRow, userId, countMap[row.id] ?? 0),
    ),
  );
}

// Lean session rows for the Chats hub. The hub only renders title / status /
// date, so this skips the commitment embeds, the per-session count RPC, and the
// expiry RPC entirely — just the union of "created by me" + "accepted on".
export async function fetchChatSessions(userId: string): Promise<Session[]> {
  const { data: committedRows, error: committedError } = await supabase
    .from('commitments')
    .select('session_id')
    .eq('user_id', userId)
    .eq('status', 'accepted');

  if (committedError) throw committedError;

  const committedIds = (committedRows ?? []).map((c) => c.session_id);

  let query = supabase
    .from('sessions')
    .select(
      `
      id, created_by, purpose, title, location, date_time, expires_at,
      max_participants, description, status, created_at, updated_at,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url)
    `,
    );

  if (committedIds.length > 0) {
    query = query.or(`created_by.eq.${userId},id.in.(${committedIds.join(',')})`);
  } else {
    query = query.eq('created_by', userId);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => normalizeSession(row as unknown as SessionRow, userId));
}

// Sessions the user was once part of (as creator or an accepted/left
// participant) that have since ended.
export async function fetchSessionHistory(userId: string): Promise<Session[]> {
  const { data: committedRows, error: committedError } = await supabase
    .from('commitments')
    .select('session_id')
    .eq('user_id', userId)
    .in('status', ['accepted', 'left']);

  if (committedError) throw committedError;

  const committedIds = (committedRows ?? []).map((c) => c.session_id);

  let query = supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    )
    .in('status', ['closed', 'completed', 'cancelled']);

  if (committedIds.length > 0) {
    query = query.or(`created_by.eq.${userId},id.in.(${committedIds.join(',')})`);
  } else {
    query = query.eq('created_by', userId);
  }

  const { data, error } = await query.order('date_time', { ascending: false });

  if (error) throw error;

  const sessions = data ?? [];
  const sessionIds = sessions.map((s) => s.id);
  const countMap = await fetchAcceptedCounts(sessionIds);

  return sessions.map((row) =>
    normalizeSession(row as SessionRow, userId, countMap[row.id] ?? 0),
  );
}

// Maximum session duration: 1 week in minutes
export const MAX_SESSION_DURATION_MINUTES = 7 * 24 * 60; // 10080 minutes

export const MIN_SESSION_PARTICIPANTS = 1;
export const MAX_SESSION_PARTICIPANTS = 50;

// Maximum future date for session: end of day, 7 days from now (inclusive)
const now = new Date();
const maxDate = new Date(now);
maxDate.setDate(maxDate.getDate() + 7);
maxDate.setHours(23, 59, 59, 999);
export const MAX_SESSION_FUTURE_DATE = maxDate.toISOString();

export async function createSession(
  userId: string,
  input: CreateSessionInput,
): Promise<Session> {
  const expireAfter = input.expireAfterMinutes ?? 30;

  if (expireAfter > MAX_SESSION_DURATION_MINUTES) {
    throw new Error(`Session duration cannot exceed 1 week (${MAX_SESSION_DURATION_MINUTES} minutes)`);
  }

  if (
    !Number.isInteger(input.max_participants) ||
    input.max_participants < MIN_SESSION_PARTICIPANTS ||
    input.max_participants > MAX_SESSION_PARTICIPANTS
  ) {
    throw new Error(
      `Session must allow between ${MIN_SESSION_PARTICIPANTS} and ${MAX_SESSION_PARTICIPANTS} participants`,
    );
  }

  const sessionDate = new Date(input.date_time);
  const maxFutureDate = new Date(MAX_SESSION_FUTURE_DATE);
  if (sessionDate > maxFutureDate) {
    throw new Error('Session cannot be scheduled more than 1 week in the future');
  }

  const expiresAt = new Date(sessionDate.getTime() + expireAfter * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('sessions')
    .insert({
      created_by: userId,
      purpose: input.purpose,
      title: input.title.trim().slice(0, MAX_SESSION_TITLE_LENGTH) || null,
      location: input.location.trim(),
      date_time: input.date_time,
      max_participants: input.max_participants,
      description: input.description?.trim() || null,
      status: 'open',
      expires_at: expiresAt,
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
  const { data: sessionRow, error: sessionError } = await supabase
    .from('sessions')
    .select('date_time, created_by, max_participants')
    .eq('id', sessionId)
    .single();

  if (sessionError) throw sessionError;
  if (!sessionRow) throw new Error('Session not found');

  if (sessionRow.max_participants != null) {
    const countMap = await fetchAcceptedCounts([sessionId]);
    if ((countMap[sessionId] ?? 0) >= sessionRow.max_participants) {
      throw new Error('This session is full.');
    }
  }

  const conflicts = await checkTimeConflicts(userId, sessionRow.date_time);
  if (conflicts.length > 0) {
    throw new Error(
      `You already have a session within 30 minutes of this one: ${conflicts[0].purpose} at ${conflicts[0].location}`,
    );
  }

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

  try {
    if (sessionRow.created_by !== userId) {
      const applicant = await fetchProfile(userId);
      await notifySessionApplication(
        sessionRow.created_by,
        sessionId,
        applicant?.username ?? 'Someone',
        userId,
      );
    }
  } catch (e) {
    console.error('Failed to send session application notification:', e);
  }

  return data;
}

export async function approveCommitment(
  commitmentId: string,
  actorId: string,
): Promise<void> {
  const { data: commitment } = await supabase
    .from('commitments')
    .select('session_id, user_id')
    .eq('id', commitmentId)
    .single();

  if (!commitment) throw new Error('Commitment not found');

  const { data: sessionRow } = await supabase
    .from('sessions')
    .select('max_participants')
    .eq('id', commitment.session_id)
    .single();

  if (sessionRow?.max_participants != null) {
    const countMap = await fetchAcceptedCounts([commitment.session_id]);
    if ((countMap[commitment.session_id] ?? 0) >= sessionRow.max_participants) {
      throw new Error(
        `This session is full (${sessionRow.max_participants}/${sessionRow.max_participants}). Cannot accept more participants.`,
      );
    }
  }

  const { error } = await supabase
    .from('commitments')
    .update({ status: 'accepted' })
    .eq('id', commitmentId);

  if (error) throw error;

  if (sessionRow?.max_participants != null) {
    const countMap = await fetchAcceptedCounts([commitment.session_id]);
    if ((countMap[commitment.session_id] ?? 0) >= sessionRow.max_participants) {
      const { error: statusError } = await supabase
        .from('sessions')
        .update({ status: 'full' })
        .eq('id', commitment.session_id);
      if (statusError) console.error('Failed to mark session as full:', statusError);
    }
  }

  await resolveSessionApplicationNotification(
    commitment.session_id,
    commitment.user_id,
    actorId,
    'accepted',
  );

  try {
    const actor = await fetchProfile(actorId);
    const { data: session } = await supabase
      .from('sessions')
      .select('title, purpose, date_time')
      .eq('id', commitment.session_id)
      .maybeSingle();
    const sessionName = session
      ? formatSessionDisplayName(session.purpose, session.date_time, session.title)
      : 'this session';
    await notifySessionAccepted(
      commitment.user_id,
      commitment.session_id,
      actor?.username ?? 'Session host',
      sessionName,
    );
  } catch (e) {
    console.error('Failed to send session accepted notification:', e);
  }
}

export async function rejectCommitment(
  commitmentId: string,
  actorId: string,
): Promise<void> {
  const { data: commitment } = await supabase
    .from('commitments')
    .select('session_id, user_id')
    .eq('id', commitmentId)
    .single();

  if (!commitment) throw new Error('Commitment not found');

  const { error } = await supabase
    .from('commitments')
    .update({ status: 'rejected' })
    .eq('id', commitmentId);

  if (error) throw error;

  await resolveSessionApplicationNotification(
    commitment.session_id,
    commitment.user_id,
    actorId,
    'rejected',
  );

  try {
    const actor = await fetchProfile(actorId);
    const { data: session } = await supabase
      .from('sessions')
      .select('title, purpose, date_time')
      .eq('id', commitment.session_id)
      .maybeSingle();
    const sessionName = session
      ? formatSessionDisplayName(session.purpose, session.date_time, session.title)
      : 'this session';
    await notifySessionRejected(
      commitment.user_id,
      commitment.session_id,
      actor?.username ?? 'Session host',
      sessionName,
    );
  } catch (e) {
    console.error('Failed to send session rejected notification:', e);
  }
}

// Resolves the session creator's pending `session_application` notification so it
// leaves the "Action Required" inbox regardless of where the action was taken.
async function resolveSessionApplicationNotification(
  sessionId: string,
  applicantId: string,
  creatorId: string,
  action: 'accepted' | 'rejected',
): Promise<void> {
  try {
    const [applicantResult, sessionResult] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', applicantId).single(),
      supabase.from('sessions').select('title, purpose, date_time').eq('id', sessionId).maybeSingle(),
    ]);

    const name = applicantResult.data?.username ?? 'Someone';
    const session = sessionResult.data;
    const sessionName = session
      ? formatSessionDisplayName(session.purpose, session.date_time, session.title)
      : 'your session';
    await supabase
      .from('in_app_notifications')
      .update({
        type: action === 'accepted' ? 'session_accepted' : 'session_rejected',
        read: true,
        body: action === 'accepted'
          ? `You accepted ${name} into the ${sessionName}`
          : `You declined ${name} from the ${sessionName}`,
      })
      .eq('user_id', creatorId)
      .eq('type', 'session_application')
      .eq('data->>sessionId', sessionId)
      .eq('data->>applicantId', applicantId);
  } catch (e) {
    console.error('Failed to resolve session application notification:', e);
  }
}

export async function uncommitFromSession(sessionId: string, userId: string): Promise<void> {
  const { data: session } = await supabase
    .from('sessions')
    .select('created_by, max_participants, status')
    .eq('id', sessionId)
    .single();

  if (!session) throw new Error('Session not found');

  const { error } = await supabase
    .from('commitments')
    .update({ status: 'left' })
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .in('status', ['pending', 'accepted']);

  if (error) throw error;

  if (session.status === 'full' && session.max_participants != null) {
    const countMap = await fetchAcceptedCounts([sessionId]);
    if ((countMap[sessionId] ?? 0) < session.max_participants) {
      const { error: statusError } = await supabase
        .from('sessions')
        .update({ status: 'open' })
        .eq('id', sessionId);
      if (statusError) console.error('Failed to reopen session:', statusError);
    }
  }

  try {
    if (session.created_by !== userId) {
      const leaver = await fetchProfile(userId);
      await notifySessionLeft(
        session.created_by,
        sessionId,
        leaver?.username ?? 'Someone',
      );
    }
  } catch (e) {
    console.error('Failed to send session left notification:', e);
  }
}

export async function fetchUserSessions(
  userId: string,
): Promise<Session[]> {
  await closeExpiredSessions(userId);

  const { data: committedRows, error: committedError } = await supabase
    .from('commitments')
    .select('session_id')
    .eq('user_id', userId)
    .eq('status', 'accepted');

  if (committedError) throw committedError;

  const committedIds = (committedRows ?? []).map((c) => c.session_id);

  let query = supabase
    .from('sessions')
    .select(
      `
      *,
      creator:profiles!sessions_created_by_fkey (id, username, avatar_url),
      commitments:commitments (id, user_id, status)
    `,
    );

  if (committedIds.length > 0) {
    query = query.or(
      `created_by.eq.${userId},and(status.in.(open,full),id.in.(${committedIds.join(',')}))`,
    );
  } else {
    query = query.eq('created_by', userId);
  }

  const { data, error } = await query.order('date_time', { ascending: true });

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

  // Remove the creator's pending applicant-approval notifications for this session
  try {
    await supabase
      .from('in_app_notifications')
      .delete()
      .eq('user_id', userId)
      .eq('type', 'session_application')
      .eq('read', false)
      .eq('data->>sessionId', sessionId);
  } catch (e) {
    console.error('Failed to clean up session application notifications:', e);
  }
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

export async function closeExpiredSessions(currentUserId?: string): Promise<void> {
  const now = Date.now();
  if (now - lastCloseExpiredAt < CLOSE_EXPIRED_MIN_INTERVAL_MS) return;
  lastCloseExpiredAt = now;

  const { error } = await supabase.rpc('close_expired_sessions');
  if (error) console.error('Failed to close expired sessions:', error);

  // Best-effort cleanup: drop the current user's pending applicant-approval
  // notifications for sessions that have ended, so "wanna let X in the session?"
  // doesn't linger in the Action Required inbox. (A DB trigger also handles this
  // server-side, see 022_cleanup_session_notifications.sql.)
  if (!currentUserId) return;
  try {
    const { data: ended } = await supabase
      .from('sessions')
      .select('id')
      .eq('created_by', currentUserId)
      .in('status', ['closed', 'completed', 'cancelled']);
    const endedIds = (ended ?? []).map((s) => s.id);
    if (endedIds.length === 0) return;
    await supabase
      .from('in_app_notifications')
      .delete()
      .eq('user_id', currentUserId)
      .eq('type', 'session_application')
      .eq('read', false)
      .in('data->>sessionId', endedIds);
  } catch (e) {
    console.error('Failed to clean up session application notifications:', e);
  }
}

export function getRemainingTime(expiresAt: string | null): string {
  if (!expiresAt) return '';
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return `closes in ${days}d ${remHours}hr`;
  }
  if (hours > 0) {
    const remMins = minutes % 60;
    return `closes in ${hours}hr ${remMins}min`;
  }
  return `closes in ${minutes}min`;
}

// ---------------------------------------------------------------------------
// Post-session feedback ("who showed up?") — filled in by the session creator
// ---------------------------------------------------------------------------

export type PendingFeedbackSession = {
  id: string;
  title: string | null;
  purpose: string;
  location: string;
  date_time: string;
  status: Session['status'];
  commitments: Commitment[];
};

// Ended sessions the current user created that still have accepted
// participants without feedback, most recent first.
export async function fetchPendingFeedbackSessions(
  userId: string,
): Promise<PendingFeedbackSession[]> {
  await closeExpiredSessions(userId);

  const { data: sessionRows, error } = await supabase
    .from('sessions')
    .select('id, title, purpose, location, date_time, status')
    .eq('created_by', userId)
    .in('status', ['closed', 'completed', 'cancelled']);

  if (error) throw error;

  const sessionIds = (sessionRows ?? []).map((s) => s.id);
  if (sessionIds.length === 0) return [];

  const { data: commitmentRows, error: commError } = await supabase
    .from('commitments')
    .select(
      `
      id, session_id, user_id, status, feedback_status, feedback_provided_by,
      created_at, updated_at,
      profile:profiles!commitments_user_id_fkey (id, username, avatar_url)
    `,
    )
    .in('session_id', sessionIds)
    .eq('status', 'accepted')
    .is('feedback_status', null);

  if (commError) throw commError;

  const bySession = new Map<string, Commitment[]>();
  for (const row of commitmentRows ?? []) {
    const list = bySession.get(row.session_id) ?? [];
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
    list.push({ ...row, profile: profile ?? null });
    bySession.set(row.session_id, list);
  }

  return (sessionRows ?? [])
    .filter((row) => (bySession.get(row.id)?.length ?? 0) > 0)
    .sort((a, b) => new Date(b.date_time).getTime() - new Date(a.date_time).getTime())
    .map((row) => ({
      id: row.id,
      title: row.title,
      purpose: row.purpose,
      location: row.location,
      date_time: row.date_time,
      status: row.status,
      commitments: bySession.get(row.id) ?? [],
    }));
}

// Creator marks which accepted participants attended. RLS allows the session
// creator to update commitments; the trigger on feedback_status updates the
// participants' completed-session counters.
export async function submitSessionFeedback(
  userId: string,
  sessionId: string,
  feedback: { commitmentId: string; status: FeedbackStatus }[],
): Promise<void> {
  if (feedback.length === 0) return;

  const results = await Promise.all(
    feedback.map(({ commitmentId, status }) =>
      supabase
        .from('commitments')
        .update({ feedback_status: status, feedback_provided_by: userId })
        .eq('id', commitmentId)
        .eq('session_id', sessionId),
    ),
  );

  for (const result of results) {
    if (result.error) throw result.error;
  }
}
