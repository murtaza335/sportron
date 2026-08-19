// @ts-nocheck — this file runs on Deno (Supabase Edge Functions), not React Native

// Supabase Edge Function: send-chat-notification
// Server-side FCM-only push for a chat message (session or community chat).
// Triggered by the `notify_chat_fcm_push()` Postgres trigger (via pg_net)
// after a row is inserted into `session_messages` / `community_messages` — it
// is NOT called by the app client anymore. This makes chat pushes work no
// matter which client sent the message (web included, which has no FCM).
//
// The function computes everything itself from the DB:
//   - recipients (session creator + accepted participants, or approved
//     community members) minus the sender
//   - chat title / sender name / body
//   - presence skip (chat_presence heartbeat TTL) for active readers
//   - per-recipient Android summary bodies from read cursors (028)
//   - a session_chat_reply / community_chat_reply push when reply_to_id is set
//
// Required Supabase secrets:
//   FCM_SERVICE_ACCOUNT — full JSON of Firebase service account key
//
// Requires a service_role bearer token (the DB trigger sends the service role
// key from Vault).

import { supabase, assertServiceRole, chatTablesFor, pushToTokens, summaryBodyFor } from '../_shared/fcm.ts';

interface ChatNotificationPayload {
  chat_type: 'session' | 'community';
  chat_id: string;
  message_id: string;
}

// Recipients whose presence heartbeat is within this window of "now" are
// actively reading the chat right now — they see the message via realtime and
// must not be pushed. The client deletes its row on clean leave and heartbeats
// every ~20s while open, so this TTL only covers abrupt app termination.
const PRESENCE_TTL_MS = 60_000;

function ordinalSuffix(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
}

function formatSessionDisplayName(purpose: string, dateTime: string, title?: string | null): string {
  if (title) return title;
  const d = new Date(dateTime);
  if (Number.isNaN(d.getTime())) return `${purpose} session`;
  const day = ordinalSuffix(d.getDate());
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  return `${purpose} ${day} ${month} session`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: ChatNotificationPayload;
  try {
    await assertServiceRole(req);
    payload = await req.json() as ChatNotificationPayload;
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 401 });
  }

  const { chat_type, chat_id, message_id } = payload ?? {};
  if (!chat_type || !chat_id || !message_id) {
    return new Response('Missing required fields: chat_type, chat_id, message_id', {
      status: 400,
    });
  }

  const tables = chatTablesFor(chat_type);

  const { data: message, error: messageError } = await supabase
    .from(tables.messageTable)
    .select('id, sender_id, content, reply_to_id, sender_username')
    .eq('id', message_id)
    .single();

  if (messageError || !message) {
    return new Response('Message not found', { status: 404 });
  }

  const senderId = message.sender_id;
  const senderName = message.sender_username ?? 'Someone';

  // Resolve recipients + chat title from the DB.
  let recipients: string[] = [];
  let chatName = '';

  if (chat_type === 'session') {
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, created_by, title, purpose, date_time')
      .eq('id', chat_id)
      .single();

    if (sessionError || !session) {
      return new Response('Session not found', { status: 404 });
    }

    const { data: commitments } = await supabase
      .from('commitments')
      .select('user_id')
      .eq('session_id', chat_id)
      .eq('status', 'accepted');

    const memberIds = new Set<string>([session.created_by]);
    for (const c of commitments ?? []) memberIds.add(c.user_id);
    recipients = [...memberIds];
    chatName = formatSessionDisplayName(session.purpose, session.date_time, session.title);
  } else {
    const { data: community, error: communityError } = await supabase
      .from('communities')
      .select('id, name')
      .eq('id', chat_id)
      .single();

    if (communityError || !community) {
      return new Response('Community not found', { status: 404 });
    }

    const { data: members } = await supabase
      .from('community_members')
      .select('profile_id')
      .eq('community_id', chat_id)
      .eq('approval_status', 'approved');

    recipients = (members ?? []).map((m) => m.profile_id);
    chatName = community.name;
  }

  recipients = recipients.filter((id) => id !== senderId);

  // The person whose message was replied to gets their own push.
  let replyTargetSenderId: string | null = null;
  if (message.reply_to_id) {
    const { data: replied } = await supabase
      .from(tables.messageTable)
      .select('sender_id')
      .eq('id', message.reply_to_id)
      .maybeSingle();
    if (replied && replied.sender_id !== senderId) {
      replyTargetSenderId = replied.sender_id;
    }
  }

  // Skip recipients who are actively reading this chat right now — the message
  // reaches them via realtime, so pushing is noise.
  const now = Date.now();
  const skipIds = new Set<string>();
  if (recipients.length > 0) {
    const { data: presenceRows } = await supabase
      .from('chat_presence')
      .select('profile_id, last_seen_at')
      .eq('chat_type', chat_type)
      .eq('chat_id', chat_id)
      .in('profile_id', recipients);

    for (const row of presenceRows ?? []) {
      if (row.last_seen_at && new Date(row.last_seen_at).getTime() >= now - PRESENCE_TTL_MS) {
        skipIds.add(row.profile_id);
      }
    }
  }

  const remaining = recipients.filter((id) => !skipIds.has(id));

  const body = `${senderName}: ${message.content}`;
  const pushData = chat_type === 'session'
    ? { type: 'session_chat_message', sessionId: chat_id }
    : { type: 'community_chat_message', communityId: chat_id };

  let mainResult = { sent: 0, failed: 0, total: 0 };

  if (remaining.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, fcm_tokens')
      .in('id', remaining);

    // Per-recipient Android summary bodies based on their read cursor.
    const androidBodyByProfile = new Map<string, string>();
    if (profiles && profiles.length > 0) {
      const [cursorsResult, messagesResult] = await Promise.all([
        supabase
          .from(tables.readTable)
          .select('profile_id, last_read_at')
          .eq(tables.readIdColumn, chat_id)
          .in('profile_id', profiles.map((p) => p.id)),
        supabase
          .from(tables.messageTable)
          .select('created_at')
          .eq(tables.messageIdColumn, chat_id),
      ]);

      const readAtByProfile = new Map<string, number>();
      for (const row of cursorsResult.data ?? []) {
        readAtByProfile.set(row.profile_id, new Date(row.last_read_at).getTime());
      }

      const messageTimes = (messagesResult.data ?? [])
        .map((m) => new Date(m.created_at).getTime())
        .sort((a, b) => a - b);

      for (const p of profiles) {
        const readAt = readAtByProfile.get(p.id) ?? -Infinity; // never-opened => everything unread
        const unreadCount = messageTimes.filter((t) => t > readAt).length;
        androidBodyByProfile.set(p.id, summaryBodyFor(unreadCount, body));
      }
    }

    const tokenRows: { token: string; androidBody: string }[] = [];
    for (const p of profiles ?? []) {
      const androidBody = androidBodyByProfile.get(p.id) ?? body;
      for (const token of (p.fcm_tokens ?? []) as string[]) {
        tokenRows.push({ token, androidBody });
      }
    }

    mainResult = await pushToTokens(tokenRows, chatName, body, pushData);
  }

  let replyResult = { sent: 0, failed: 0, total: 0 };
  if (replyTargetSenderId) {
    const { data: replyProfile } = await supabase
      .from('profiles')
      .select('fcm_tokens')
      .eq('id', replyTargetSenderId)
      .single();

    const replyBody = `${senderName} replied to you: ${message.content}`;
    const replyPushData = chat_type === 'session'
      ? { type: 'session_chat_reply', sessionId: chat_id, messageId: message_id }
      : { type: 'community_chat_reply', communityId: chat_id, messageId: message_id };

    const tokenRows = ((replyProfile?.fcm_tokens ?? []) as string[]).map((token) => ({
      token,
      androidBody: replyBody,
    }));

    replyResult = await pushToTokens(tokenRows, chatName, replyBody, replyPushData);
  }

  const result = {
    sent: mainResult.sent + replyResult.sent,
    failed: mainResult.failed + replyResult.failed,
    total: mainResult.total + replyResult.total,
  };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
});