// @ts-nocheck — shared FCM plumbing for the server-side push edge functions.
// Runs on Deno (Supabase Edge Functions), imported by both `send-notification`
// (in-app notifications) and `send-chat-notification` (FCM-only chat pushes).
//
// These functions are NEVER called from the app client anymore — they are only
// invoked by Postgres triggers (pg_net) after a row is inserted, so push
// delivery works no matter which client (web, iOS, Android) performed the
// action.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPKCS8, SignJWT, jwtVerify } from 'https://esm.sh/jose@5';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiry = 0;
let accessTokenPromise: Promise<string> | null = null;

// ---------------------------------------------------------------------------
// Auth: only the service role may trigger pushes. The DB trigger sends the
// service role key (from Vault) as the Bearer token; verify it is a real
// service_role JWT so an anon/authenticated client cannot spam arbitrary users.
// ---------------------------------------------------------------------------

export async function assertServiceRole(req: Request): Promise<void> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
  if (!token) throw new Error('Missing Authorization header');

  // Preferred: verify the JWT signature with the project's JWT secret. Some
  // projects don't inject SUPABASE_JWT_SECRET (or its encoding differs), so
  // fall back to an exact match against the service role key that the DB
  // trigger sends (and that this function already has as an env var).
  const secret = Deno.env.get('SUPABASE_JWT_SECRET');
  if (secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.role === 'service_role') return;
    } catch {
      // fall through to the service-key comparison below
    }
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (token !== serviceKey) {
    console.error('[assertServiceRole] token mismatch', {
      tokenPrefix: token.slice(0, 24),
      tokenTail: token.slice(-12),
      tokenLength: token.length,
      serviceKeyPrefix: serviceKey?.slice(0, 24),
      serviceKeyTail: serviceKey?.slice(-12),
      serviceKeyLength: serviceKey?.length,
      hasJwtSecret: !!secret,
    });
    throw new Error('Invalid Authorization token');
  }
}

// ---------------------------------------------------------------------------
// Firebase OAuth access token (cached, single-flight, 5-min refresh margin)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// FCM HTTP v1 message building + fan-out
// ---------------------------------------------------------------------------

// Conversation key so successive chat notifications replace each other on the
// device instead of stacking (WhatsApp-style "latest wins"). Returned as
// `chat_room_<id>` and wired into BOTH:
//   - android.notification.tag — replaces a previously displayed notification
//     with the same tag in the tray on Android (background/terminated; the FCM
//     SDK's default FirebaseMessagingService calls
//     NotificationManager.notify(tag, id, ...) with this tag)
//   - apns.headers['apns-collapse-id'] — collapses/replaces prior notifications
//     for the same conversation on iOS
// It is stable per chat (NOT a per-message UUID), so message #2 replaces
// message #1 for that room. Reply pushes share the same key as the room's
// message pushes so a "replied to you" banner replaces the room's message
// banner rather than stacking on top of it.
function chatRoomKeyFor(data?: Record<string, unknown>): string | null {
  const type = data?.type;
  if ((type === 'session_chat_message' || type === 'session_chat_reply') && data?.sessionId) {
    return `chat_room_${data.sessionId}`;
  }
  if ((type === 'community_chat_message' || type === 'community_chat_reply') && data?.communityId) {
    return `chat_room_${data.communityId}`;
  }
  return null;
}

// Android body is ALWAYS the actual messages, never a "N new messages" count.
//
// HYBRID payload (chat pushes):
//   - `notification` block present => the OS / Google Play Services auto-displays
//     the banner even when the app process is DEAD (force-stopped excepted).
//     This is the fix for "no notifications when the app isn't running": a
//     data-only message needs the app to be started, and Android often refuses
//     to start it (OEM battery killers, Doze).
//   - `android.notification.tag` => consecutive OS-displayed banners for the
//     same chat replace each other in the tray instead of stacking.
//   - `data.body` carries the ACCUMULATED unread messages (server-computed from
//     read cursors), so when the app IS running (foreground) RNFirebase
//     delivers the payload to JS and the app re-posts it under a stable
//     per-chat identifier — the user reads every unread message in one banner.
//   - iOS always displays via the system `aps.alert`; `apns-collapse-id`
//     replaces the previous banner for the same chat.
function buildMessage(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  const roomKey = chatRoomKeyFor(data);
  const stringData = Object.fromEntries(
    Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]),
  );
  return {
    message: {
      token,
      notification: { title, body },
      data: { ...stringData, title, body },
      android: {
        priority: 'high',
        // Always set channel_id so FCM delivers to the 'default' channel
        // (created client-side with AndroidImportance.MAX) instead of the
        // auto-generated "Miscellaneous" channel (IMPORTANCE_DEFAULT).
        notification: {
          channel_id: 'default',
          sound: 'default',
          ...(roomKey ? { tag: roomKey } : {}),
        },
        // collapseKey only dedupes messages still in FCM's transit queue for a
        // dead/offline device; in-place replacement of the visible banner is
        // handled by android.notification.tag (OS path) and the client's stable
        // identifier (app-running path).
        ...(roomKey ? { collapseKey: roomKey } : {}),
      },
      apns: {
        // apns-collapse-id header: successive pushes for the same conversation
        // overwrite the older one in Notification Center.
        ...(roomKey ? { headers: { 'apns-collapse-id': roomKey } } : {}),
        payload: {
          aps: {
            alert: { title, body },
            sound: 'default',
            badge: 1,
          },
        },
      },
    },
  };
}

// Sends to many tokens in one fan-out. `tokenRows` carries a per-token body
// (chat pushes have a per-recipient accumulated-unread body); it is used for
// both the Android/`notification` payload and the iOS `aps.alert` payload.
export async function pushToTokens(
  tokenRows: { token: string; body: string }[],
  title: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number; failed: number; total: number }> {
  if (tokenRows.length === 0) return { sent: 0, failed: 0, total: 0 };

  const accessToken = await getAccessToken();
  const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const results = await Promise.allSettled(
    tokenRows.map(async ({ token, body }) => {
      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildMessage(token, title, body, data)),
      });
      if (!res.ok) {
        const bodyText = await res.text();
        throw new Error(`FCM responded ${res.status}: ${bodyText}`);
      }
      return res;
    }),
  );

  let sent = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') sent++;
    else failed++;
  }

  return { sent, failed, total: tokenRows.length };
}

// ---------------------------------------------------------------------------
// Chat helpers (shared by send-chat-notification)
// ---------------------------------------------------------------------------

// Resolve the chat tables for a given chat type.
export function chatTablesFor(chatType: 'session' | 'community') {
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
