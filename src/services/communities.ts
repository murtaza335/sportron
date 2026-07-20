import { supabase } from '@/lib/supabase';
import type { Community, CommunityMember, CreateCommunityInput } from '@/types';

type CommunityRow = Community & {
  member_count: { count: number }[] | null;
};

function normalizeCommunity(row: CommunityRow): Community {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image_url: row.image_url,
    visibility: row.visibility,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    member_count: row.member_count?.[0]?.count ?? 0,
  };
}

export async function fetchPublicCommunities(): Promise<Community[]> {
  const { data, error } = await supabase
    .from('communities')
    .select(`
      *,
      member_count:community_members(count)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => normalizeCommunity(row as CommunityRow));
}

export async function fetchCommunityById(id: string): Promise<Community | null> {
  const { data, error } = await supabase
    .from('communities')
    .select(`
      *,
      member_count:community_members(count)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data ? normalizeCommunity(data as CommunityRow) : null;
}

export async function createCommunity(
  userId: string,
  input: CreateCommunityInput,
): Promise<Community> {
  const { data, error } = await supabase
    .from('communities')
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      visibility: input.visibility,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;

  const { error: memberError } = await supabase
    .from('community_members')
    .insert({
      community_id: data.id,
      profile_id: userId,
      role: 'admin',
      approval_status: 'approved',
    });

  if (memberError) throw memberError;

  return { ...data, member_count: 1 };
}

export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  const { data, error } = await supabase
    .from('community_members')
    .select('*')
    .eq('community_id', communityId);

  if (error) throw error;
  return data ?? [];
}

export async function joinCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .insert({
      community_id: communityId,
      profile_id: userId,
      role: 'member',
      approval_status: 'approved',
    });

  if (error) throw error;
}

export async function leaveCommunity(communityId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('community_members')
    .delete()
    .eq('community_id', communityId)
    .eq('profile_id', userId);

  if (error) throw error;
}
