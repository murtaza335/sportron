import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchCommunityById,
  fetchCommunityMember,
  fetchMyJoinRequest,
  fetchUserPendingInvites,
} from '@/services/communities';
import type { Community, CommunityInvite, CommunityJoinRequest, CommunityMember } from '@/types';

let communityChannelSeq = 0;

export function useCommunity(id: string, userId?: string) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [membership, setMembership] = useState<CommunityMember | null>(null);
  const [myPendingInvite, setMyPendingInvite] = useState<CommunityInvite | null>(null);
  const [myJoinRequest, setMyJoinRequest] = useState<CommunityJoinRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mountedRef = useRef(true);
  const userIdRef = useRef(userId);
  useEffect(() => {
    userIdRef.current = userId;
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const uid = userIdRef.current;
      const [communityData, memberData, invites, ownRequest] = await Promise.all([
        fetchCommunityById(id),
        uid ? fetchCommunityMember(id, uid) : Promise.resolve(null),
        uid ? fetchUserPendingInvites(uid) : Promise.resolve([]),
        uid ? fetchMyJoinRequest(id, uid) : Promise.resolve(null),
      ]);
      setCommunity(communityData);
      setMembership(memberData);
      setMyPendingInvite(invites.find((i) => i.community_id === id) ?? null);
      setMyJoinRequest(ownRequest);
    } catch (e) {
      console.error('Failed to load community:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!id || !userId) return;

    const topic = `community-${id}-${userId}-${++communityChannelSeq}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_invites',
          filter: `invitee_id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const invite = payload.new as CommunityInvite;
          if (invite.community_id === id && invite.status === 'pending') {
            setMyPendingInvite(invite);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'community_invites',
          filter: `invitee_id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const invite = payload.new as CommunityInvite;
          if (invite.community_id === id) {
            if (invite.status === 'pending') {
              setMyPendingInvite(invite);
            } else {
              setMyPendingInvite((prev) => (prev?.id === invite.id ? null : prev));
            }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'community_invites',
          filter: `invitee_id=eq.${userId}`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const deletedId = (payload.old as { id: string }).id;
          setMyPendingInvite((prev) => (prev?.id === deletedId ? null : prev));
        },
      )
      .subscribe();

    channelRef.current = channel;

    const base = `realtime:community-${id}-${userId}-`;
    for (const other of supabase.getChannels()) {
      if (other !== channel && other.topic.startsWith(base)) {
        supabase.removeChannel(other);
      }
    }

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [id, userId, load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return {
    community,
    membership,
    myPendingInvite,
    myJoinRequest,
    loading,
    refresh,
    setMembership,
  };
}
