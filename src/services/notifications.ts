import { supabase } from '@/lib/supabase';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const fcmFunctionUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/send-notification` : '';

async function triggerFcmPush(userId: string, title: string, body: string, data?: Record<string, unknown>) {
  if (!fcmFunctionUrl || !supabaseAnonKey) return;

  try {
    fetch(fcmFunctionUrl, {
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

export type NotificationType =
  | 'match_pending'
  | 'match_approved'
  | 'match_rejected'
  | 'match_liked'
  | 'match_commented';

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

  triggerFcmPush(input.userId, input.title, input.body, input.data);

  return Array.isArray(data) ? data[0] : data;
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

// Helper functions to create specific notification types
export async function notifyMatchPending(opponentId: string, matchId: string, creatorName: string): Promise<void> {
  await createNotification({
    userId: opponentId,
    type: 'match_pending',
    title: 'Match Pending Approval',
    body: `${creatorName} submitted a match for your approval`,
    data: { matchId },
  });
}

export async function notifyMatchApproved(creatorId: string, matchId: string, opponentName: string): Promise<void> {
  await createNotification({
    userId: creatorId,
    type: 'match_approved',
    title: 'Match Approved!',
    body: `${opponentName} approved your match`,
    data: { matchId },
  });
}

export async function notifyMatchRejected(creatorId: string, matchId: string, opponentName: string): Promise<void> {
  await createNotification({
    userId: creatorId,
    type: 'match_rejected',
    title: 'Match Disputed',
    body: `${opponentName} disputed your match`,
    data: { matchId },
  });
}

export async function notifyMatchLiked(ownerId: string, matchId: string, likerName: string): Promise<void> {
  await createNotification({
    userId: ownerId,
    type: 'match_liked',
    title: 'New Like on Your Match',
    body: `${likerName} liked your match`,
    data: { matchId },
  });
}

export async function notifyMatchCommented(ownerId: string, matchId: string, commenterName: string, commentId: string): Promise<void> {
  await createNotification({
    userId: ownerId,
    type: 'match_commented',
    title: 'New Comment on Your Match',
    body: `${commenterName} commented on your match`,
    data: { matchId, commentId },
  });
}