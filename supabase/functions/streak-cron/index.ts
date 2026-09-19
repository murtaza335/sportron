// @ts-nocheck — Supabase Edge Function for streak notifications
// Runs on a cron schedule (pg_cron) to send daily streak reminders
// and at-risk alerts. Creates in_app_notification rows which trigger
// the existing send-notification edge function via DB trigger.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertServiceRole } from '../_shared/fcm.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

const STREAK_MOTIVATIONAL_LINES = [
  "Your streak is waiting — one match keeps it alive! 🔥",
  "Don't let the streak die. Play today! 💪",
  "Champions show up daily. Your turn! 🏆",
  "One game. That's all it takes to extend your streak. 🎯",
  "Your future self will thank you for playing today. ✨",
  "Streak on the line. Make it count! ⚡",
  "Every legend started with a single day. Keep going! 🌟",
];

const STREAK_AT_RISK_LINES = [
  "⚠️ Your {streak}-day streak ends at midnight! One match saves it.",
  "🚨 {hours}h left to save your {streak}-day streak!",
  "⏰ Streak emergency: {streak} days on the line. Play now!",
];

const RETENTION_NUDGE_LINES = [
  "Plan a game for tomorrow, Now! 🏓",
  "Missing the court? Book a session in seconds! 🎾",
  "Your next match is waiting. Create a session! 🏸",
  "Don't let the week slip by — plan a game! ⚡",
  "Quick game tomorrow? Set it up now! ✨",
  "Find players near you. Start a session! 🔥",
];

function getRandomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

function getTodayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

function getYesterdayUTC(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Reset streak_count to 0 for users whose streak is broken (last activity before yesterday)
async function resetBrokenStreaks(): Promise<number> {
  const yesterday = getYesterdayUTC();
  const { data, error } = await supabase
    .from('profiles')
    .update({ streak_count: 0, streak_updated_at: new Date().toISOString() })
    .gt('streak_count', 0)
    .lt('last_activity_date', yesterday)
    .is('deleted_at', null)
    .select('id');

  if (error) {
    console.error('[streak-cron] Failed to reset broken streaks:', error);
    return 0;
  }
  return data?.length ?? 0;
}

async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from('in_app_notifications')
    .insert({
      user_id: userId,
      type,
      title,
      body,
      data: data ?? null,
      read: false,
    });

  if (error) throw error;
}

async function sendStreakReminders() {
  const today = getTodayUTC();
  
  // Get users with active streaks who haven't been active today
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, username, streak_count, last_activity_date, fcm_tokens, notification_preferences')
    .gt('streak_count', 0)
    .neq('last_activity_date', today)
    .is('deleted_at', null);

  if (error) {
    console.error('[streak-cron] Failed to fetch users for streak reminders:', error);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const user of users ?? []) {
    try {
      await createNotification(
        user.id,
        'streak_reminder',
        'Keep Your Streak Alive! 🔥',
        getRandomLine(STREAK_MOTIVATIONAL_LINES),
        { streakCount: user.streak_count }
      );
      sent++;
    } catch (e) {
      console.error(`[streak-cron] Failed to send streak reminder to ${user.id}:`, e);
      failed++;
    }
  }

  return { sent, failed };
}

async function sendRetentionNudges() {
  const today = getTodayUTC();
  
  // Get ALL users who have FCM tokens (not deleted)
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, username, last_activity_date, fcm_tokens')
    .is('deleted_at', null)
    .not('fcm_tokens', 'is', null);

  if (error) {
    console.error('[streak-cron] Failed to fetch users for retention nudges:', error);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const user of users ?? []) {
    const tokens = (user.fcm_tokens ?? []) as string[];
    if (tokens.length === 0) continue;

    try {
      await createNotification(
        user.id,
        'session_reminder',
        'Plan a game for tomorrow, Now! 🏓',
        getRandomLine(RETENTION_NUDGE_LINES),
        { retentionNudge: true }
      );
      sent++;
    } catch (e) {
      console.error(`[streak-cron] Failed to send retention nudge to ${user.id}:`, e);
      failed++;
    }
  }

  return { sent, failed };
}

async function sendAtRiskAlerts() {
  const yesterday = getYesterdayUTC();
  
  // Get users at risk (last activity before yesterday, streak > 0)
  // who have streak_at_risk preference enabled
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, username, streak_count, last_activity_date, fcm_tokens, notification_preferences')
    .gt('streak_count', 0)
    .lt('last_activity_date', yesterday)
    .is('deleted_at', null);

  if (error) {
    console.error('[streak-cron] Failed to fetch at-risk users:', error);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const user of users ?? []) {
    // Calculate hours since last activity
    const lastActive = new Date(`${user.last_activity_date}T00:00:00Z`);
    const now = new Date();
    const diffMs = now.getTime() - lastActive.getTime();
    const hoursLeft = Math.max(0, 24 - Math.floor(diffMs / (1000 * 60 * 60)));

    try {
      const line = getRandomLine(STREAK_AT_RISK_LINES)
        .replace('{streak}', user.streak_count.toString())
        .replace('{hours}', hoursLeft.toString());
      
      await createNotification(
        user.id,
        'streak_at_risk',
        'Streak at Risk! ⚠️',
        line,
        { streakCount: user.streak_count, hoursLeft }
      );
      sent++;
    } catch (e) {
      console.error(`[streak-cron] Failed to send at-risk alert to ${user.id}:`, e);
      failed++;
    }
  }

  return { sent, failed };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    await assertServiceRole(req);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 401 });
  }

  // Reset broken streaks before sending notifications
  const resetCount = await resetBrokenStreaks();
  if (resetCount > 0) {
    console.log(`[streak-cron] Reset ${resetCount} broken streaks to 0`);
  }

  const body = await req.json().catch(() => ({}));
  const { mode } = body as { mode?: 'streak-reminder' | 'retention' | 'at-risk' | 'all' };

  const results: Record<string, { sent: number; failed: number }> = {};

  if (mode === 'streak-reminder' || mode === 'all' || !mode) {
    results.streak_reminder = await sendStreakReminders();
  }

  if (mode === 'retention' || mode === 'all') {
    results.retention_nudge = await sendRetentionNudges();
  }

  if (mode === 'at-risk' || mode === 'all') {
    results.at_risk = await sendAtRiskAlerts();
  }

  return new Response(JSON.stringify({ ...results, resetBrokenStreaks: resetCount }), {
    headers: { 'Content-Type': 'application/json' },
  });
});