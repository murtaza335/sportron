import { supabase } from '@/lib/supabase';
import type { NotificationType } from '@/types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const fcmFunctionUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/send-notification` : '';

export async function pushFcmToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  if (!fcmFunctionUrl || !supabaseAnonKey) return;

  try {
    await fetch(fcmFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ user_id: userId, title, body, data }),
    });
  } catch {
    // fire-and-forget: silently ignore FCM failures
  }
}

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

  pushFcmToUser(input.userId, input.title, input.body, input.data);

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

export async function notifyPing(communityMemberIds: string[], communityId: string, communityName: string, senderName: string, message: string, pingId?: string): Promise<void> {
  await createNotificationForMultipleUsers(
    communityMemberIds,
    'ping',
    `Ping from ${communityName}`,
    `${senderName}: ${message} — tap to reply`,
    { communityId, message, senderName, pingId },
  );
}

export async function notifyPingResponse(senderId: string, pingId: string, communityId: string, respondentName: string, response: 'coming' | 'busy', message: string): Promise<void> {
  await createNotification({
    userId: senderId,
    type: 'ping_response',
    title: response === 'coming' ? 'Coming!' : 'Busy',
    body: `${respondentName} is ${response === 'coming' ? 'coming' : 'busy'} — "${message}"`,
    data: { pingId, communityId, respondentName, response, message },
  });
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
