// @ts-nocheck — this file runs on Deno (Supabase Edge Functions), not React Native

// Supabase Edge Function: send-notification
// Server-side FCM push for ONE in-app notification row. Triggered by the
// `notify_fcm_push()` Postgres trigger (via pg_net) after a row is inserted
// into `in_app_notifications` — it is NOT called by the app client anymore.
//
// Required Supabase secrets:
//   FCM_SERVICE_ACCOUNT — full JSON of Firebase service account key
//
// Accepts only `notification_id` and requires a service_role bearer token (the
// DB trigger sends the service role key from Vault). The OAuth access token is
// cached (with a single-flight promise) across requests in a warm Deno
// instance, so a fan-out only signs one JWT.

import { supabase, assertServiceRole, pushToTokens } from '../_shared/fcm.ts';

interface NotificationPayload {
  notification_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let payload: NotificationPayload;
  try {
    await assertServiceRole(req);
    payload = await req.json() as NotificationPayload;
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 401 });
  }

  const { notification_id } = payload;
  if (!notification_id) {
    return new Response('Missing required field: notification_id', { status: 400 });
  }

  const { data: notification, error } = await supabase
    .from('in_app_notifications')
    .select('id, user_id, type, title, body, data')
    .eq('id', notification_id)
    .single();

  if (error || !notification) {
    return new Response('Notification not found', { status: 404 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('fcm_tokens')
    .eq('id', notification.user_id)
    .single();

  if (profileError) {
    return new Response('Failed to fetch profile: ' + profileError.message, { status: 500 });
  }

  const tokens = (profile?.fcm_tokens ?? []) as string[];
  if (tokens.length === 0) {
    return new Response(JSON.stringify({ sent: 0, failed: 0, total: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // `type` is carried in the FCM data so tap-routing (useFCM) knows where to
  // navigate; the rest of the row's data carries the semantic ids (sessionId,
  // communityId, matchId, ...).
  const data = {
    ...((notification.data ?? {}) as Record<string, unknown>),
    type: notification.type,
  };

  const tokenRows = tokens.map((token) => ({ token, body: notification.body }));

  try {
    const result = await pushToTokens(tokenRows, notification.title, data);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-notification] FCM push failed:', err);
    return new Response(err instanceof Error ? err.message : String(err), { status: 500 });
  }
});
