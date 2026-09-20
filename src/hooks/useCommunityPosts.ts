import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchCommunityPosts,
  fetchCommunityPostById,
  createCommunityPost,
  deleteCommunityPost,
  toggleCommunityPostLike,
  fetchCommunityPostComments,
  addCommunityPostComment,
} from '@/services/communities';
import type { CommunityPost } from '@/types';

export function useCommunityPosts(communityId: string | null, userId: string | null) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const mountedRef = useRef(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initialLoadRef = useRef(true);

  const loadPosts = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (!communityId) return;
    try {
      const { data, hasMore: more } = await fetchCommunityPosts(communityId, userId ?? undefined, pageNum, 20);
      if (append) {
        setPosts((prev) => [...prev, ...data]);
      } else {
        setPosts(data);
      }
      setHasMore(more);
      setPage(pageNum);
    } catch (e) {
      console.error('Failed to load community posts:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [communityId, userId]);

  const refresh = useCallback(() => {
    setPage(1);
    setHasMore(false);
    setRefreshing(true);
    loadPosts(1);
  }, [loadPosts]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await loadPosts(page + 1, true);
  }, [loadingMore, hasMore, page, loadPosts]);

  useEffect(() => {
    mountedRef.current = true;
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      loadPosts(1);
    }
    return () => { mountedRef.current = false; };
  }, [loadPosts]);

  useEffect(() => {
    if (!communityId || !userId) return;

    const channel = supabase
      .channel(`community-posts-${communityId}-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts',
          filter: `community_id=eq.${communityId}`,
        },
        async (payload) => {
          if (!mountedRef.current) return;
          if (payload.eventType === 'INSERT') {
            const newPost = await fetchCommunityPostById(payload.new.id, userId);
            if (newPost) {
              setPosts((prev) => {
                if (prev.some((p) => p.id === newPost.id)) return prev;
                return [newPost, ...prev];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedPost = await fetchCommunityPostById(payload.new.id, userId);
            if (updatedPost) {
              setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
            }
          } else if (payload.eventType === 'DELETE') {
            setPosts((prev) => prev.filter((p) => p.id !== (payload.old as { id: string }).id));
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_post_likes',
          filter: `post_id=in.(${posts.map(p => p.id).join(',')})`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const postId = (payload.new as { post_id: string })?.post_id ?? (payload.old as { post_id: string })?.post_id;
          if (!postId) return;
          setPosts((prev) =>
            prev.map((p) => {
              if (p.id !== postId) return p;
              if (payload.eventType === 'INSERT') {
                const isMe = (payload.new as { profile_id: string }).profile_id === userId;
                return { ...p, likes_count: (p.likes_count ?? 0) + 1, is_liked_by_user: isMe || p.is_liked_by_user };
              }
              if (payload.eventType === 'DELETE') {
                const isMe = (payload.old as { profile_id: string }).profile_id === userId;
                return { ...p, likes_count: Math.max(0, (p.likes_count ?? 0) - 1), is_liked_by_user: isMe ? false : p.is_liked_by_user };
              }
              return p;
            }),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'community_post_comments',
          filter: `post_id=in.(${posts.map(p => p.id).join(',')})`,
        },
        (payload) => {
          if (!mountedRef.current) return;
          const postId = (payload.new as { post_id: string }).post_id;
          if (!postId) return;
          setPosts((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, comments_count: (p.comments_count ?? 0) + 1 } : p)),
          );
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [communityId, userId, posts]);

  return {
    posts,
    loading,
    refreshing,
    refresh,
    loadMore,
    loadingMore,
    hasMore,
    createPost: createCommunityPost,
    deletePost: deleteCommunityPost,
    toggleLike: toggleCommunityPostLike,
    fetchComments: fetchCommunityPostComments,
    addComment: addCommunityPostComment,
  };
}