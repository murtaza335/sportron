import { supabase } from '@/lib/supabase';
import type { NotificationType } from '@/types';

// Push delivery is now 100% server-side: inserting into `in_app_notifications`
// (via the `insert_notification` RPC below) fires a Postgres trigger that calls
// the `send-notification` edge function. No client code triggers FCM anymore,
// so pushes work regardless of which platform performs the action.

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function fetchNotifications(userId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('in_app_notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function fetchUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('in_app_notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function createNotification(input: CreateNotificationInput): Promise<any> {
  const { data, error } = await supabase
    .rpc('insert_notification', {
      p_user_id: input.userId,
      p_type: input.type,
      p_title: input.title,
      p_body: input.body,
      p_data: input.data ?? null,
    });

  if (error) {
    throw error;
  }

  // No FCM call here — the server-side trigger on in_app_notifications pushes.

  return Array.isArray(data) ? data[0] : data;
}

export async function createNotificationForMultipleUsers(
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await Promise.allSettled(
    userIds.map((userId) =>
      createNotification({ userId, type, title, body, data })
    )
  );
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) {
    throw error;
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('in_app_notifications')
    .update({ read: true })
    .eq('user_id', userId)
    .eq('read', false);

  if (error) {
    throw error;
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('in_app_notifications')
    .delete()
    .eq('id', notificationId);

  if (error) {
    throw error;
  }
}

// Session notifications
export async function notifySessionApplication(sessionCreatorId: string, sessionId: string, applicantName: string, applicantId: string): Promise<void> {
  await createNotification({
    userId: sessionCreatorId,
    type: 'session_application',
    title: 'New Session Applicant',
    body: `${applicantName} applied to your session`,
    data: { sessionId, applicantId },
  });
}

export async function notifySessionAccepted(applicantId: string, sessionId: string, creatorName: string, sessionName: string): Promise<void> {
  await createNotification({
    userId: applicantId,
    type: 'session_accepted',
    title: 'Session Application Accepted',
    body: `${creatorName} accepted you into the ${sessionName}`,
    data: { sessionId },
  });
}

export async function notifySessionRejected(applicantId: string, sessionId: string, creatorName: string, sessionName: string): Promise<void> {
  await createNotification({
    userId: applicantId,
    type: 'session_rejected',
    title: 'Session Application Declined',
    body: `${creatorName} declined your request for the ${sessionName}`,
    data: { sessionId },
  });
}

export async function notifySessionLeft(sessionCreatorId: string, sessionId: string, leaverName: string): Promise<void> {
  await createNotification({
    userId: sessionCreatorId,
    type: 'session_left',
    title: 'Participant Left',
    body: `${leaverName} left your session`,
    data: { sessionId },
  });
}

export async function notifySessionReminder(userId: string, sessionId: string, sessionLocation: string, sessionTime: string): Promise<void> {
  await createNotification({
    userId,
    type: 'session_reminder',
    title: 'Upcoming Session Reminder',
    body: `Your session at ${sessionLocation} is scheduled for ${sessionTime}`,
    data: { sessionId },
  });
}

export async function notifyFeedbackPrompt(userId: string, sessionId: string): Promise<void> {
  await createNotification({
    userId,
    type: 'feedback_prompt',
    title: 'Session Feedback',
    body: 'Please provide feedback for your recent session',
    data: { sessionId },
  });
}

// Community notifications
export async function notifyJoinRequest(
  adminIds: string[],
  communityId: string,
  communityName: string,
  requesterName: string,
  requesterId: string,
): Promise<void> {
  await createNotificationForMultipleUsers(
    adminIds,
    'join_request',
    'New Join Request',
    `${requesterName} wants to join ${communityName}`,
    { communityId, requesterId },
  );
}

export async function notifyJoinApproved(userId: string, communityId: string, communityName: string): Promise<void> {
  await createNotification({
    userId,
    type: 'join_approved',
    title: 'Join Request Approved',
    body: `You were accepted into ${communityName}`,
    data: { communityId },
  });
}

export async function notifyJoinRejected(userId: string, communityId: string, communityName: string): Promise<void> {
  await createNotification({
    userId,
    type: 'join_rejected',
    title: 'Join Request Declined',
    body: `Your request to join ${communityName} was declined`,
    data: { communityId },
  });
}

export async function notifyPing(communityMemberIds: string[], communityId: string, communityName: string, senderName: string, message: string): Promise<void> {
  await createNotificationForMultipleUsers(
    communityMemberIds,
    'ping',
    `Ping from ${communityName}`,
    `${senderName}: ${message}`,
    { communityId, message, senderName },
  );
}

export async function notifyCommunityMatchPending(opponentId: string, communityMatchId: string, communityId: string, recorderName: string, communityName: string): Promise<void> {
  await createNotification({
    userId: opponentId,
    type: 'community_match_pending',
    title: 'Match Pending Approval',
    body: `${recorderName} recorded a match in ${communityName} for your approval`,
    data: { matchId: communityMatchId, communityId },
  });
}

export async function notifyCommunityMatchApproved(recorderId: string, communityMatchId: string, communityId: string, opponentName: string, communityName: string): Promise<void> {
  await createNotification({
    userId: recorderId,
    type: 'community_match_approved',
    title: 'Match Approved',
    body: `${opponentName} approved the match in ${communityName}`,
    data: { matchId: communityMatchId, communityId },
  });
}

export async function notifyCommunityMatchDisputed(recorderId: string, communityMatchId: string, communityId: string, opponentName: string, communityName: string): Promise<void> {
  await createNotification({
    userId: recorderId,
    type: 'community_match_disputed',
    title: 'Match Disputed',
    body: `${opponentName} disputed the match in ${communityName}`,
    data: { matchId: communityMatchId, communityId },
  });
}

export async function notifyCommunityMatchLiked(ownerId: string, communityMatchId: string, communityId: string, likerName: string): Promise<void> {
  await createNotification({
    userId: ownerId,
    type: 'match_liked',
    title: 'New Like on Your Match',
    body: `${likerName} liked your match`,
    data: { matchId: communityMatchId, communityId },
  });
}

export async function notifyCommunityMatchCommented(ownerId: string, communityMatchId: string, communityId: string, commenterName: string, commentId: string): Promise<void> {
  await createNotification({
    userId: ownerId,
    type: 'match_commented',
    title: 'New Comment on Your Match',
    body: `${commenterName} commented on your match`,
    data: { matchId: communityMatchId, communityId, commentId },
  });
}

export async function notifyMemberRemoved(userId: string, communityId: string, communityName: string): Promise<void> {
  await createNotification({
    userId,
    type: 'member_removed',
    title: 'Removed from Community',
    body: `You were removed from ${communityName}`,
    data: { communityId },
  });
}

export async function notifyAdminTransferred(newAdminId: string, communityId: string, communityName: string, previousAdminName: string): Promise<void> {
  await createNotification({
    userId: newAdminId,
    type: 'admin_transferred',
    title: 'Admin Rights Transferred',
    body: `${previousAdminName} transferred admin rights to you in ${communityName}`,
    data: { communityId },
  });
}

export async function notifyPromotedToAdmin(
  userId: string,
  communityId: string,
  communityName: string,
  actorName: string,
): Promise<void> {
  await createNotification({
    userId,
    type: 'admin_promoted',
    title: 'Promoted to Admin',
    body: `${actorName} made you an admin in ${communityName}`,
    data: { communityId },
  });
}

export async function notifyCommunityInvite(
  inviteeId: string,
  communityId: string,
  communityName: string,
  inviterName: string,
  inviteId: string,
): Promise<void> {
  await createNotification({
    userId: inviteeId,
    type: 'community_invite',
    title: 'Community Invitation',
    body: `${inviterName} invited you to join ${communityName}`,
    data: { communityId, inviteId },
  });
}

export async function notifyCommunityInviteResponse(
  inviterId: string,
  communityId: string,
  communityName: string,
  inviteeName: string,
  accepted: boolean,
): Promise<void> {
  await createNotification({
    userId: inviterId,
    type: accepted ? 'community_invite_accepted' : 'community_invite_rejected',
    title: accepted ? 'Invitation Accepted' : 'Invitation Declined',
    body: `${inviteeName} ${accepted ? 'accepted' : 'declined'} your invitation to ${communityName}`,
    data: { communityId },
  });
}

// Streak notifications
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

const STREAK_MILESTONE_LINES: Record<number, string> = {
  3: "🎉 3-day streak! You're building a habit!",
  7: "🔥 Week warrior! 7 days straight!",
  14: "💪 Two weeks strong! Consistency is key!",
  30: "🏆 30 days! You're a streak legend!",
  60: "⚡ 60 days! Unstoppable!",
  100: "🌟 CENTURY! 100-day streak achieved!",
};

function getRandomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

export async function notifyStreakReminder(userId: string, streakCount: number): Promise<void> {
  await createNotification({
    userId,
    type: 'streak_reminder',
    title: 'Keep Your Streak Alive! 🔥',
    body: getRandomLine(STREAK_MOTIVATIONAL_LINES),
    data: { streakCount },
  });
}

export async function notifyStreakAtRisk(userId: string, streakCount: number, hoursLeft: number): Promise<void> {
  const line = getRandomLine(STREAK_AT_RISK_LINES)
    .replace('{streak}', streakCount.toString())
    .replace('{hours}', hoursLeft.toString());
  
  await createNotification({
    userId,
    type: 'streak_at_risk',
    title: 'Streak at Risk! ⚠️',
    body: line,
    data: { streakCount, hoursLeft },
  });
}

export async function notifyStreakMilestone(userId: string, streakCount: number): Promise<void> {
  const message = STREAK_MILESTONE_LINES[streakCount] || `🎉 Amazing! ${streakCount}-day streak!`;
  
  await createNotification({
    userId,
    type: 'streak_milestone',
    title: 'Streak Milestone! 🏆',
    body: message,
    data: { streakCount },
  });
}
