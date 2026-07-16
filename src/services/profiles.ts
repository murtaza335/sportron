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
  const updates: Record<string, string | null> = {};

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
