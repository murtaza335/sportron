import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import {
  fetchCommunityById,
  fetchCommunityMember,
  fetchJoinRequests,
} from '@/services/communities';
import type { Community, CommunityJoinRequest, CommunityMember } from '@/types';

export function useCommunity(id: string, userId?: string) {
  const [community, setCommunity] = useState<Community | null>(null);
  const [membership, setMembership] = useState<CommunityMember | null>(null);
  const [joinRequests, setJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [communityData, memberData] = await Promise.all([
        fetchCommunityById(id),
        userId ? fetchCommunityMember(id, userId) : Promise.resolve(null),
      ]);
      setCommunity(communityData);
      setMembership(memberData);

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

  const refresh = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  return {
    community,
    membership,
    joinRequests,
    loading,
    refresh,
    setMembership,
    setJoinRequests,
  };
}
