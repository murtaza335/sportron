// @ts-nocheck — Supabase Edge Function for community admin engagement notifications
// Runs on a cron schedule (pg_cron) every 4-5 days to send engaging nudges
// to community admins about their community's growth and activity.
// Creates in_app_notification rows which trigger the existing send-notification
// edge function via the DB trigger (trg_fcm_push).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { assertServiceRole } from '../_shared/fcm.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// Sport-specific emojis and terms
const SPORT_CONFIG: Record<string, { emoji: string; court: string; match: string; session: string; players: string }> = {
  table_tennis: { emoji: '🏓', court: 'table', match: 'match', session: 'session', players: 'players' },
  badminton: { emoji: '🏸', court: 'court', match: 'match', session: 'session', players: 'players' },
  tennis: { emoji: '🎾', court: 'court', match: 'match', session: 'session', players: 'players' },
  squash: { emoji: '🎾', court: 'court', match: 'match', session: 'session', players: 'players' },
  pickleball: { emoji: '🏓', court: 'court', match: 'match', session: 'session', players: 'players' },
  football: { emoji: '⚽', court: 'pitch', match: 'match', session: 'session', players: 'players' },
  cricket: { emoji: '🏏', court: 'pitch', match: 'match', session: 'session', players: 'players' },
  volleyball: { emoji: '🏐', court: 'court', match: 'match', session: 'session', players: 'players' },
  handball: { emoji: '🤾', court: 'court', match: 'match', session: 'session', players: 'players' },
  basketball: { emoji: '🏀', court: 'court', match: 'match', session: 'session', players: 'players' },
  other: { emoji: '🏓', court: 'court', match: 'game', session: 'session', players: 'members' },
};

function getSportConfig(sport: string) {
  return SPORT_CONFIG[sport] || SPORT_CONFIG.other;
}

// Generic engagement titles (used across all sports)
const ENGAGEMENT_TITLES = [
  "📈 Your community is growing!",
  "🎉 Community milestone reached!",
  "👥 New faces in your community",
  "🔥 Keep the momentum going!",
  "📊 Your community stats are looking great",
];

function getRandomLine<T>(lines: T[]): T {
  return lines[Math.floor(Math.random() * lines.length)];
}

function getDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().split('T')[0];
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

// Sport-specific message generators
function getGrowthBodies(sport: string) {
  const cfg = getSportConfig(sport);
  return [
    (communityName: string, memberCount: number, newMembers: number) =>
      `${cfg.emoji} ${communityName} has grown to ${memberCount} ${cfg.players}! ${newMembers} new ${cfg.players.slice(0, -1)}${newMembers !== 1 ? 's' : ''} joined recently. Post something to welcome them! 🎉`,
    
    (communityName: string, memberCount: number, newMembers: number) =>
      `Amazing! ${communityName} now has ${memberCount} ${cfg.players} (+${newMembers} this week). Your community is thriving — share an update or plan a ${cfg.session}! ${cfg.emoji}`,
    
    (communityName: string, memberCount: number, newMembers: number) =>
      `${newMembers} new ${cfg.players.slice(0, -1)}${newMembers !== 1 ? 's' : ''} joined ${communityName} this week! Total: ${memberCount}. A quick post from you keeps everyone engaged. 💬`,
    
    (communityName: string, memberCount: number, newMembers: number) =>
      `Your community ${communityName} hit ${memberCount} ${cfg.players}! That's ${newMembers} new face${newMembers !== 1 ? 's' : ''} recently. Drop a post or create a ${cfg.session} to keep them active! 🚀`,
    
    (communityName: string, memberCount: number, newMembers: number) =>
      `Growth alert: ${communityName} is now ${memberCount} strong (+${newMembers} new). Communities with active admins see 3x more engagement. Post something today! ${cfg.emoji}`,
  ];
}

function getInactiveBodies(sport: string) {
  const cfg = getSportConfig(sport);
  return [
    (communityName: string, daysSincePost: number) =>
      `It's been ${daysSincePost} days since the last post in ${communityName}. Your ${cfg.players} are waiting for an update — share a photo, ${cfg.match} result, or quick thought! ${cfg.emoji}`,
    
    (communityName: string, daysSincePost: number) =>
      `${communityName} has been quiet for ${daysSincePost} days. Be the spark — post a ${cfg.match}, photo, or question to get conversations going! 💬`,
    
    (communityName: string, daysSincePost: number) =>
      `No new posts in ${communityName} for ${daysSincePost} days. A quick update from you can reignite the community. What's happening on the ${cfg.court}? ${cfg.emoji}`,
  ];
}

function getGeneralNudge(sport: string) {
  const cfg = getSportConfig(sport);
  const nudges = [
    (communityName: string, memberCount: number) =>
      `${communityName} has ${memberCount} ${cfg.players}. Keep them engaged with a post or ${cfg.session}! ${cfg.emoji}`,
    
    (communityName: string, memberCount: number) =>
      `Your ${cfg.players} in ${communityName} are ready for action. Plan a ${cfg.session} or share a ${cfg.match} update! ${cfg.emoji}`,
    
    (communityName: string, memberCount: number) =>
      `${memberCount} ${cfg.players} in ${communityName} — keep the energy high with a new post! ${cfg.emoji}`,
  ];
  return getRandomLine(nudges);
}

async function sendCommunityEngagementNotifications(): Promise<{ sent: number; failed: number }> {
  // Get communities with recent growth (new members in last 7 days)
  // and their admins — NOW INCLUDING sport
  const sevenDaysAgo = getDateDaysAgo(7);

  const { data: communities, error: commError } = await supabase
    .from('communities')
    .select(`
      id,
      name,
      sport,
      created_by,
      community_members!inner (
        profile_id,
        role,
        approval_status,
        joined_at
      )
    `)
    .eq('community_members.approval_status', 'approved')
    .eq('community_members.role', 'admin');

  if (commError) {
    console.error('[community-engagement] Failed to fetch communities:', commError);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const community of communities ?? []) {
    const sport = community.sport || 'other';
    const cfg = getSportConfig(sport);
    
    // Count total approved members
    const { count: totalMembers } = await supabase
      .from('community_members')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id)
      .eq('approval_status', 'approved');

    // Count new members in last 7 days
    const { count: newMembers } = await supabase
      .from('community_members')
      .select('*', { count: 'exact', head: true })
      .eq('community_id', community.id)
      .eq('approval_status', 'approved')
      .gte('joined_at', sevenDaysAgo);

    // Get last post date
    const { data: lastPost } = await supabase
      .from('community_posts')
      .select('created_at')
      .eq('community_id', community.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const daysSincePost = lastPost
      ? Math.floor((Date.now() - new Date(lastPost.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    // Notify each admin
    const admins = (community.community_members as any[]).filter(
      (m: any) => m.role === 'admin' && m.approval_status === 'approved'
    );

    for (const admin of admins) {
      try {
        let title: string;
        let body: string;

        // If there's recent growth, celebrate it with sport-specific message
        if (newMembers && newMembers > 0) {
          title = getRandomLine(ENGAGEMENT_TITLES);
          body = getRandomLine(getGrowthBodies(sport))(
            community.name,
            totalMembers ?? 0,
            newMembers
          );
        } 
        // If community has been inactive, nudge to post with sport-specific message
        else if (daysSincePost >= 7) {
          title = `💤 Your ${cfg.court} is quiet`;
          body = getRandomLine(getInactiveBodies(sport))(community.name, daysSincePost);
        }
        // Otherwise, general engagement nudge (sport-specific)
        else {
          title = getRandomLine(ENGAGEMENT_TITLES);
          body = getGeneralNudge(sport)(community.name, totalMembers ?? 0);
        }

        await createNotification(
          admin.profile_id,
          'community_engagement',
          title,
          body,
          {
            communityId: community.id,
            sport: sport,
            memberCount: totalMembers ?? 0,
            newMembersLastWeek: newMembers ?? 0,
            daysSinceLastPost: daysSincePost,
          }
        );
        sent++;
      } catch (e) {
        console.error(`[community-engagement] Failed to notify admin ${admin.profile_id} for community ${community.id}:`, e);
        failed++;
      }
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

  const results = await sendCommunityEngagementNotifications();

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
});