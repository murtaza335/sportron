// @ts-nocheck — this file runs on Deno (Supabase Edge Functions), not React Native

// Supabase Edge Function: send-notification
// Triggered by HTTP call to push FCM notifications.
// Sends FCM via Firebase HTTP v1 API.
//
// Required Supabase secrets:
//   FCM_SERVICE_ACCOUNT — full JSON of Firebase service account key
//
// Accepts `user_ids` (array) for a single batched fan-out across many
// recipients, or a single `user_id` for backward compatibility. The OAuth
// access token is cached (with a single-flight promise) across requests in a
// warm Deno instance, so a message fan-out only signs one JWT.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface SendNotificationPayload {
  user_id?: string;
  user_ids?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  presence_filter?: {
    chat_type: 'session' | 'community';
    chat_id: string;
  };
  active_reader_filter?: {
    table: 'session_chat_read' | 'community_chat_read';
    id_column: 'session_id' | 'community_id';
    chat_id: string;
    message_created_at: string;
  };
}

// Recipients whose presence heartbeat is within this window of "now" are
// actively reading the chat right now — they see the message via realtime and
// must not be pushed. The client deletes its row on clean leave and heartbeats
// every ~20s while open, so this TTL only covers abrupt app termination.
const PRESENCE_TTL_MS = 60_000;
// Legacy conservative window for old clients that send active_reader_filter.
const ACTIVE_READER_WINDOW_MS = 90_000;
// Instagram-style cap on the cumulative body ("4+ new messages").
const SUMMARY_CAP = 4;

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;
let accessTokenPromise: Promise<string> | null = null;

async function fetchAccessToken(): Promise<string> {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) throw new Error('FCM_SERVICE_ACCOUNT not configured');

  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  const privateKey = await importPKCS8(sa.private_key, 'RS256');

  const jwt = await new SignJWT({
    iss: sa.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .sign(privateKey);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
  }

  cachedAccessToken = data.access_token as string;
  // Refresh 5 minutes before the 1-hour expiry.
  cachedAccessTokenExpiry = now + 3600 - 300;
  return cachedAccessToken;
}

// Returns a cached token when valid, otherwise signs exactly one JWT (later
// concurrent callers share the same in-flight request).
function getAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && now < cachedAccessTokenExpiry) {
    return Promise.resolve(cachedAccessToken);
  }
  if (!accessTokenPromise) {
    accessTokenPromise = fetchAccessToken().finally(() => {
      accessTokenPromise = null;
    });
  }
  return accessTokenPromise;
}

// FCM collapse key per conversation so successive chat notifications replace
// each other on the device instead of stacking (WhatsApp-style "latest wins").
// Only valid on Android while the app is in the background.
function collapseKeyFor(data?: Record<string, unknown>): string | null {
  const type = data?.type;
  if ((type === 'session_chat_message' || type === 'session_chat_reply') && data?.sessionId) {
    return `t3s-session-${data.sessionId}`;
  }
  if ((type === 'community_chat_message' || type === 'community_chat_reply') && data?.communityId) {
    return `t3s-community-${data.communityId}`;
  }
  return null;
}

// Android shows the cumulative summary body; iOS keeps the per-message body
// (iOS has no collapse key, so stacking stays readable as individual messages).
function buildMessage(
  token: string,
  title: string,
  androidBody: string,
  apnsBody: string,
  data?: Record<string, unknown>,
) {
  const collapseKey = collapseKeyFor(data);
  return {
    message: {
      token,
      notification: { title, body: androidBody },
      data: Object.fromEntries(
        Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      android: {
        priority: 'high',
        ...(collapseKey ? { collapseKey } : {}),
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body: apnsBody },
            sound: 'default',
            badge: 1,
          },
        },
      },
    },
  };
}

// Resolve the chat tables for a given chat type.
function chatTablesFor(chatType: 'session' | 'community') {
  return chatType === 'session'
    ? {
        readTable: 'session_chat_read' as const,
        readIdColumn: 'session_id' as const,
        messageTable: 'session_messages' as const,
        messageIdColumn: 'session_id' as const,
      }
    : {
        readTable: 'community_chat_read' as const,
        readIdColumn: 'community_id' as const,
        messageTable: 'community_messages' as const,
        messageIdColumn: 'community_id' as const,
      };
}

// Android summary body: 1 -> the message itself, 2-4 -> exact count, 5+ -> "4+".
function summaryBodyFor(count: number, perMessageBody: string): string {
  if (count <= 1) return perMessageBody;
  if (count <= SUMMARY_CAP) return `${count} new messages`;
  return `${SUMMARY_CAP}+ new messages`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const raw = await req.json() as Partial<SendNotificationPayload> & Record<string, unknown>;
  console.log('[send-notification] payload', JSON.stringify(raw));
  const { user_id, user_ids, title, body, data, presence_filter, active_reader_filter } = raw;
  const recipients = user_ids && user_ids.length > 0 ? user_ids : user_id ? [user_id] : [];
  if (recipients.length === 0 || !title || !body) {
    return new Response('Missing required fields: user_ids (or user_id), title, body', {
      status: 400,
    });
  }

  // Skip recipients who are actively reading this chat right now — the message
  // reaches them via realtime, so pushing is noise. Service role bypasses RLS.
  // New clients send presence_filter (presence heartbeat table); old clients
  // send active_reader_filter (read-cursor recency) and are kept working.
  const skipIds = new Set<string>();
  let chatContext:
    | { chatType: 'session' | 'community'; chatId: string }
    | null = null;

  if (presence_filter && recipients.length > 0) {
    chatContext = { chatType: presence_filter.chat_type, chatId: presence_filter.chat_id };
    const now = Date.now();
    const { data: presenceRows, error: presenceError } = await supabase
      .from('chat_presence')
      .select('profile_id, last_seen_at')
      .eq('chat_type', presence_filter.chat_type)
      .eq('chat_id', presence_filter.chat_id)
      .in('profile_id', recipients);

    if (presenceError) {
      // A missing presence table (migration not applied yet) must not break
      // chat pushes entirely — fall back to pushing everyone.
      console.error('Failed to fetch chat presence:', presenceError);
    } else {
      for (const row of presenceRows ?? []) {
        if (row.last_seen_at && new Date(row.last_seen_at).getTime() >= now - PRESENCE_TTL_MS) {
          skipIds.add(row.profile_id);
        }
      }
    }
  } else if (active_reader_filter && recipients.length > 0) {
    chatContext = {
      chatType: active_reader_filter.table === 'session_chat_read' ? 'session' : 'community',
      chatId: active_reader_filter.chat_id,
    };
    const messageTime = new Date(active_reader_filter.message_created_at).getTime();
    const { data: cursors, error: cursorError } = await supabase
      .from(active_reader_filter.table)
      .select('profile_id, last_read_at')
      .eq(active_reader_filter.id_column, active_reader_filter.chat_id)
      .in('profile_id', recipients);

    if (cursorError) {
      console.error('Failed to fetch chat read cursors:', cursorError);
    } else {
      for (const row of cursors ?? []) {
        if (row.last_read_at && new Date(row.last_read_at).getTime() >= messageTime - ACTIVE_READER_WINDOW_MS) {
          skipIds.add(row.profile_id);
        }
      }
    }
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('Failed to get access token:', err);
    return new Response('Auth failed: ' + (err instanceof Error ? err.message : String(err)), {
      status: 500,
    });
  }

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, fcm_tokens')
    .in('id', recipients);

  if (error) {
    return new Response('Failed to fetch profiles: ' + error.message, { status: 500 });
  }

  // Per-recipient Android summary bodies for chat pushes.
  const androidBodyByProfile = new Map<string, string>();
  const recipientProfiles = (profiles ?? []).filter((p) => !skipIds.has(p.id));

  if (recipientProfiles.length > 0 && chatContext) {
    const { readTable, readIdColumn, messageTable, messageIdColumn } = chatTablesFor(
      chatContext.chatType,
    );

    const [cursorsResult, messagesResult] = await Promise.all([
      supabase
        .from(readTable)
        .select('profile_id, last_read_at')
        .eq(readIdColumn, chatContext.chatId)
        .in('profile_id', recipientProfiles.map((p) => p.id)),
      supabase
        .from(messageTable)
        .select('created_at')
        .eq(messageIdColumn, chatContext.chatId),
    ]);

    const readAtByProfile = new Map<string, number>();
    if (!cursorsResult.error) {
      for (const row of cursorsResult.data ?? []) {
        readAtByProfile.set(row.profile_id, new Date(row.last_read_at).getTime());
      }
    }

    const messageTimes = (messagesResult.data ?? [])
      .map((m) => new Date(m.created_at).getTime())
      .sort((a, b) => a - b);

    for (const p of recipientProfiles) {
      const readAt = readAtByProfile.get(p.id) ?? -Infinity; // never-opened => everything unread
      const unreadCount = messageTimes.filter((t) => t > readAt).length;
      androidBodyByProfile.set(p.id, summaryBodyFor(unreadCount, body));
    }
  }

  const tokenRows: { token: string; profileId: string }[] = [];
  for (const p of recipientProfiles) {
    for (const token of (p.fcm_tokens ?? []) as string[]) {
      tokenRows.push({ token, profileId: p.id });
    }
  }
  if (tokenRows.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, total: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!).project_id}/messages:send`;

  const results = await Promise.allSettled(
    tokenRows.map(async ({ token, profileId }) => {
      const androidBody = androidBodyByProfile.get(profileId) ?? body;
      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildMessage(token, title, androidBody, body, data)),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(`FCM responded ${res.status}: ${bodyText}`);
      }
      return res;
    })
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') sent++;
    else failed++;
  }

  return new Response(JSON.stringify({ sent, failed, total: tokenRows.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
