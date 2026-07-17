// @ts-nocheck — this file runs on Deno (Supabase Edge Functions), not React Native

// Supabase Edge Function: send-notification
// Triggered by HTTP call after in_app_notification is inserted.
// Sends FCM push via Firebase HTTP v1 API.
//
// Required Supabase secrets:
//   FCM_SERVICE_ACCOUNT — full JSON of Firebase service account key

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'https://esm.sh/jose@5';

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

interface SendNotificationPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function getAccessToken(): Promise<string> {
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

  return data.access_token as string;
}

function buildMessage(
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  return {
    message: {
      token,
      notification: { title, body },
      data: Object.fromEntries(
        Object.entries(data ?? {}).map(([k, v]) => [k, String(v)]),
      ),
      android: { priority: 'high' },
      apns: {
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

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { user_id, title, body, data }: SendNotificationPayload = await req.json();
  if (!user_id || !title || !body) {
    return new Response('Missing required fields: user_id, title, body', { status: 400 });
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('Failed to get access token:', err);
    return new Response('Auth failed: ' + (err instanceof Error ? err.message : String(err)), { status: 500 });
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('fcm_tokens')
    .eq('id', user_id)
    .single();

  if (error || !profile) {
    return new Response('User not found', { status: 404 });
  }

  const tokens: string[] = profile.fcm_tokens ?? [];
  if (tokens.length === 0) {
    return new Response('No FCM tokens', { status: 200 });
  }

  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT')!).project_id}/messages:send`;

  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      const res = await fetch(fcmUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(buildMessage(token, title, body, data)),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`FCM responded ${res.status}: ${body}`);
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

  return new Response(JSON.stringify({ sent, failed, total: tokens.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
