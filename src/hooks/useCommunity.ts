import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchCommunityById,
  fetchCommunityMember,
  fetchJoinRequests,
  fetchMyJoinRequest,
  fetchUserPendingInvites,
} from '@/services/communities';
import type { Community, CommunityInvite, CommunityJoinRequest, CommunityMatch, CommunityMember } from '@/types';

export function useCommunity(id: string, userId?: string) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [membership, setMembership] = useState<CommunityMember | null>(null);
  const [joinRequests, setJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [myPendingInvite, setMyPendingInvite] = useState<CommunityInvite | null>(null);
  const [myJoinRequest, setMyJoinRequest] = useState<CommunityJoinRequest | null>(null);
  const [pendingMatches, setPendingMatches] = useState<CommunityMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [communityData, memberData, invites, ownRequest] = await Promise.all([
        fetchCommunityById(id),
        userId ? fetchCommunityMember(id, userId) : Promise.resolve(null),
        userId ? fetchUserPendingInvites(userId) : Promise.resolve([]),
        userId ? fetchMyJoinRequest(id, userId) : Promise.resolve(null),
      ]);
      setCommunity(communityData);
      setMembership(memberData);
      setMyPendingInvite(invites.find((i) => i.community_id === id) ?? null);
      setMyJoinRequest(ownRequest);

      if (memberData?.role === 'admin') {
        const requests = await fetchJoinRequests(id);
        setJoinRequests(requests);
      } else {
        setJoinRequests([]);
      }
    } catch (e) {
      console.error('Failed to load community:', e);
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!id || !userId) return;

    const channel = supabase
      .channel(`community-${id}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_invites',
          filter: `invitee_id=eq.${userId}`,
        },
        (payload) => {
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
          const deletedId = (payload.old as { id: string }).id;
          setMyPendingInvite((prev) => (prev?.id === deletedId ? null : prev));
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_join_requests',
          filter: `community_id=eq.${id}`,
        },
        (payload) => {
          if (membership?.role === 'admin') {
            load();
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_matches',
          filter: `community_id=eq.${id}`,
        },
        (payload) => {
          const match = payload.new as CommunityMatch;
          if (match.approval_status === 'pending' && (match.opponent_id === userId || match.recorded_by === userId)) {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              setPendingMatches((prev) => {
                if (prev.some((m) => m.id === match.id)) {
                  return prev.map((m) => (m.id === match.id ? match : m));
                }
                return [match, ...prev];
              });
            } else if (payload.eventType === 'DELETE') {
              setPendingMatches((prev) => prev.filter((m) => m.id !== (payload.old as { id: string }).id));
            }
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, userId, membership?.role, load]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return {
    community,
    membership,
    joinRequests,
    myPendingInvite,
    myJoinRequest,
    pendingMatches,
    loading,
    refresh,
    setMembership,
    setJoinRequests,
  };
}
