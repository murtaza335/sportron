import { supabase } from '@/lib/supabase';
import type { CreateProfileInput, NotificationPreferences, Profile } from '@/types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Fetch any user's public profile (no fcm_tokens / notification_preferences).
 * Uses the `public_profiles` view which strips sensitive columns.
 */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Profile | null;
}

/**
 * Fetch the current user's FULL profile (including fcm_tokens, notification_preferences).
 * Only use this for the logged-in user — other users' sensitive data is hidden by RLS.
 */
export async function fetchOwnProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function isUsernameAvailable(username: string, excludeUserId?: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  let query = supabase
    .from('public_profiles')
    .select('id')
    .ilike('username', normalized);

  if (excludeUserId && isValidUUID(excludeUserId)) {
    query = query.neq('id', excludeUserId);
  }

  const { data, error } = await query.limit(1);

  if (error) {
    throw error;
  }

  return (data?.length ?? 0) === 0;
}

export async function fetchAllProfiles(excludeUserId?: string): Promise<Profile[]> {
  let query = supabase
    .from('public_profiles')
    .select('*')
    .is('deleted_at', null)
    .order('username', { ascending: true });

  if (excludeUserId && isValidUUID(excludeUserId)) {
    query = query.neq('id', excludeUserId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data ?? [];
}

export async function createProfile(userId: string, input: CreateProfileInput): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: userId,
      username: input.username.trim().toLowerCase(),
      bio: input.bio?.trim() || null,
      avatar_url: input.avatarUrl || null,
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateProfile(
  userId: string,
  input: Partial<CreateProfileInput>,
): Promise<Profile> {
  const updates: Record<string, string | null | string[] | object> = {};

  if (input.username !== undefined) {
    updates.username = input.username.trim().toLowerCase();
  }
  if (input.bio !== undefined) {
    updates.bio = input.bio.trim() || null;
  }
  if (input.avatarUrl !== undefined) {
    updates.avatar_url = input.avatarUrl;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function updateNotificationPreferences(
  userId: string,
  preferences: Partial<NotificationPreferences>
): Promise<Profile> {
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  const currentPrefs = existingProfile?.notification_preferences || { ...DEFAULT_NOTIFICATION_PREFERENCES };

  const updatedPrefs = { ...currentPrefs, ...preferences };

  const { data, error } = await supabase
    .from('profiles')
    .update({ notification_preferences: updatedPrefs })
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function addFCMToken(userId: string, token: string): Promise<void> {
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('fcm_tokens')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  const existingTokens = existingProfile?.fcm_tokens || [];
  const updatedTokens = [...new Set([...existingTokens, token])];

  const { error } = await supabase
    .from('profiles')
    .update({ fcm_tokens: updatedTokens })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

export async function removeFCMToken(userId: string, token: string): Promise<void> {
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('fcm_tokens')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  const existingTokens = existingProfile?.fcm_tokens || [];
  const updatedTokens = existingTokens.filter((t: string) => t !== token);

  const { error } = await supabase
    .from('profiles')
    .update({ fcm_tokens: updatedTokens })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

export async function softDeleteAccount(userId: string): Promise<void> {
  const defaultPrefs: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...Object.fromEntries(
      Object.keys(DEFAULT_NOTIFICATION_PREFERENCES).map((k) => [k, false]),
    ),
  } as NotificationPreferences;

  const { error } = await supabase
    .from('profiles')
    .update({
      bio: null,
      avatar_url: null,
      fcm_tokens: [],
      notification_preferences: defaultPrefs,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

export async function reEnableAccount(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      deleted_at: null,
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}
