// @ts-nocheck — this file runs on Deno (Supabase Edge Functions), not React Native

// Supabase Edge Function: send-chat-notification
// Server-side FCM-only push for a chat message (session or community chat).
// Triggered by the `notify_chat_fcm_push()` Postgres trigger (via pg_net)
// after a row is inserted into `session_messages` / `community_messages` — it
// is NOT called by the app client anymore. This makes chat pushes work no
// matter which client sent the message (web included, which has no FCM).
//
// Data flow (consolidated — 1 DB query per invocation):
//   1. The INSERT trigger enriches the payload with sender_id, sender_username,
//      content, and reply_to_id (all available on the NEW row at INSERT time).
//   2. A single RPC call (`get_chat_push_data`) returns chat name, recent
//      messages, recipients with FCM tokens + read cursors, and reply target.
//   3. The edge function does trivial in-memory unread filtering per recipient
//      (array.filter — no DB calls) and builds per-recipient FCM token rows.
//   4. FCM fan-out via pushToTokens().
//
// Required Supabase secrets:
//   FCM_SERVICE_ACCOUNT — full JSON of Firebase service account key
//
// Requires a service_role bearer token (the DB trigger sends the service role
// key from Vault).

import { supabase, assertServiceRole, pushToTokens } from '../_shared/fcm.ts';

interface ChatNotificationPayload {
  chat_type: 'session' | 'community';
  chat_id: string;
  message_id: string;
  sender_id: string;
  sender_username: string | null;
  content: string;
  reply_to_id: string | null;
}

interface MessageRow {
  sender_username: string | null;
  content: string;
  created_at: string;
}

interface RecipientRow {
  profile_id: string;
  fcm_tokens: string[] | null;
  last_read_at: string | null;
}

interface ProfileRow {
  id: string;
  fcm_tokens: string[] | null;
}

interface ChatPushData {
  chat_name: string;
  messages: MessageRow[];
  recipients: RecipientRow[];
  reply_target: ProfileRow | null;
  sender_tokens: ProfileRow | null;
}

const MAX_UNREAD_BODY_CHARS = 2000;

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

  const { chat_type, chat_id, message_id, sender_id, sender_username, content, reply_to_id } = payload ?? {};
  if (!chat_type || !chat_id || !message_id || !sender_id) {
    return new Response('Missing required fields: chat_type, chat_id, message_id, sender_id', {
      status: 400,
    });
  }

  const senderName = sender_username ?? 'Someone';

  // ── Single DB call: all recipient data, FCM tokens, recent messages, ──
  // ── read cursors, and reply target in one round-trip.                  ──
  const { data: rpcData, error: rpcError } = await supabase
    .rpc('get_chat_push_data', {
      p_message_id: message_id,
      p_chat_type: chat_type,
      p_chat_id: chat_id,
      p_sender_id: sender_id,
      p_sender_name: senderName,
      p_reply_to_id: reply_to_id ?? null,
    })
    .single();

  if (rpcError || !rpcData) {
    return new Response('RPC failed or returned no data', { status: 500 });
  }

  const data = rpcData as unknown as ChatPushData;
  const chatName = data.chat_name ?? (chat_type === 'session' ? 'Session' : 'Community');
  const recentMessages = data.messages ?? [];

  // Exclude the reply target from the main recipients list to avoid a
  // duplicate push — they receive the dedicated "replied to you" push instead.
  const replyTargetId = data.reply_target?.id ?? null;
  const recipients = (data.recipients ?? []).filter(
    (r) => !replyTargetId || r.profile_id !== replyTargetId,
  );

  // Pre-compute timestamps for unread filtering (no per-recipient DB calls).
  const msgTimestamps = recentMessages.map((m) => new Date(m.created_at).getTime());
  const msgTexts = recentMessages.map((m) => `${m.sender_username ?? 'Someone'}: ${m.content}`);

  const pushData = chat_type === 'session'
    ? { type: 'session_chat_message', sessionId: chat_id }
    : { type: 'community_chat_message', communityId: chat_id };

  let mainResult = { sent: 0, failed: 0, total: 0 };

  if (recipients.length > 0) {
    // Build per-recipient FCM token list. Each recipient gets an accumulated
    // unread body computed in-memory from the pre-fetched messages array.
    const tokenRows: { token: string; body: string }[] = [];
    for (const r of recipients) {
      const readAt = r.last_read_at ? new Date(r.last_read_at).getTime() : -Infinity;

      // Accumulate ALL unread messages (oldest first) into a single body.
      // Drop oldest lines first to stay under the FCM data limit.
      const lines: string[] = [];
      for (let i = 0; i < msgTexts.length; i++) {
        if (msgTimestamps[i] > readAt) lines.push(msgTexts[i]);
      }

      let body: string;
      if (lines.length === 0) {
        body = `${senderName}: ${content}`;
      } else {
        body = lines.join('\n');
        while (body.length > MAX_UNREAD_BODY_CHARS && lines.length > 1) {
          lines.shift();
          body = lines.join('\n');
        }
        if (body.length > MAX_UNREAD_BODY_CHARS) {
          body = `${body.slice(0, MAX_UNREAD_BODY_CHARS)}…`;
        }
      }

      for (const token of (r.fcm_tokens ?? []) as string[]) {
        tokenRows.push({ token, body });
      }
    }

    mainResult = await pushToTokens(tokenRows, chatName, pushData);
  }

  let replyResult = { sent: 0, failed: 0, total: 0 };
  if (data.reply_target) {
    const replyBody = `${senderName} replied to you: ${content}`;
    const replyPushData = chat_type === 'session'
      ? { type: 'session_chat_reply', sessionId: chat_id, messageId: message_id }
      : { type: 'community_chat_reply', communityId: chat_id, messageId: message_id };

    const tokenRows = ((data.reply_target.fcm_tokens ?? []) as string[]).map((token) => ({
      token,
      body: replyBody,
    }));

    replyResult = await pushToTokens(tokenRows, chatName, replyPushData);
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
