import { supabase } from '@/lib/supabase';
import type { CreateProfileInput, Profile } from '@/types';

export async function fetchProfile(userId: string): Promise<Profile | null> {
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

export async function fetchAllProfiles(excludeUserId?: string): Promise<Profile[]> {
  let query = supabase
    .from('profiles')
    .select('*')
    .order('display_name', { ascending: true });

  if (excludeUserId) {
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
      display_name: input.displayName.trim(),
      bio: input.bio?.trim() || null,
      role: input.role,
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

  if (input.displayName !== undefined) {
    updates.display_name = input.displayName.trim();
  }
  if (input.bio !== undefined) {
    updates.bio = input.bio.trim() || null;
  }
  if (input.role !== undefined) {
    updates.role = input.role;
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
  preferences: Partial<Profile['notification_preferences']>
): Promise<Profile> {
  const { data: existingProfile, error: fetchError } = await supabase
    .from('profiles')
    .select('notification_preferences')
    .eq('id', userId)
    .single();

  if (fetchError) {
    throw fetchError;
  }

  const currentPrefs = existingProfile?.notification_preferences || {
    match_pending: true,
    match_approved: true,
    match_rejected: true,
    match_liked: true,
    match_commented: true,
  };

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
