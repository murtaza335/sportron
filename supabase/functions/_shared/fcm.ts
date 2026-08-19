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

export const SUMMARY_CAP = 4;

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

// Android summary body: 1 -> the message itself, 2-4 -> exact count, 5+ -> "4+".
export function summaryBodyFor(count: number, perMessageBody: string): string {
  if (count <= 1) return perMessageBody;
  if (count <= SUMMARY_CAP) return `${count} new messages`;
  return `${SUMMARY_CAP}+ new messages`;
}

// Sends to many tokens in one fan-out. `tokenRows` may carry a per-recipient
// Android summary body (chat); non-chat pushes pass the plain body.
export async function pushToTokens(
  tokenRows: { token: string; androidBody: string }[],
  title: string,
  apnsBody: string,
  data?: Record<string, unknown>,
): Promise<{ sent: number; failed: number; total: number }> {
  if (tokenRows.length === 0) return { sent: 0, failed: 0, total: 0 };

  const accessToken = await getAccessToken();
  const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const results = await Promise.allSettled(
    tokenRows.map(async ({ token, androidBody }) => {
      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildMessage(token, title, androidBody, apnsBody, data)),
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
