import { useCallback, useEffect, useRef, useState } from 'react';
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

// Every subscription run gets a unique realtime topic. supabase.channel(name)
// REUSES an already-registered channel with the same topic, and .on() throws
// once a channel is subscribed ("cannot add postgres_changes callbacks after
// subscribe()"). A per-run suffix guarantees a fresh channel.
let communityChannelSeq = 0;

export function useCommunity(id: string, userId?: string) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [membership, setMembership] = useState<CommunityMember | null>(null);
  const [joinRequests, setJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [myPendingInvite, setMyPendingInvite] = useState<CommunityInvite | null>(null);
  const [myJoinRequest, setMyJoinRequest] = useState<CommunityJoinRequest | null>(null);
  const [pendingMatches, setPendingMatches] = useState<CommunityMatch[]>([]);
  const [loading, setLoading] = useState(true);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const membershipRef = useRef<CommunityMember | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    membershipRef.current = membership;
  }, [membership]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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

    // Use a unique topic each run so we never hit "cannot add callbacks after subscribe()"
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_join_requests',
          filter: `community_id=eq.${id}`,
        },
        () => {
          if (!mountedRef.current) return;
          if (membershipRef.current?.role === 'admin') {
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
          if (!mountedRef.current) return;
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

    channelRef.current = channel;

    // Close any OTHER channels still registered for the same community/user
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
