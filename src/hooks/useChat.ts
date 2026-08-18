import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchChatReadCursor,
  fetchChatUnreadCount,
  normalizeChatMessage,
  upsertChatReadCursor,
  type ReplyTargetInfo,
} from '@/services/chat';
import type { ChatMessageBase } from '@/types';

type SenderProfile = { id: string; username: string; avatar_url: string | null };

// Every subscription run gets a unique realtime topic. supabase.channel(name)
// REUSES an already-registered channel with the same topic, and .on() throws
// once a channel is subscribed ("cannot add postgres_changes callbacks after
// subscribe()"). Two live screens for the same chat (e.g. a community screen
// pushed from a push notification on top of an existing one) or a re-subscribe
// racing the async teardown of a previous channel would otherwise collide on
// the same topic and crash. A per-run suffix guarantees a fresh channel.
let chatChannelSeq = 0;

export type ChatSourceConfig<T extends ChatMessageBase> = {
  sourceId: string | null;
  table: 'session_messages' | 'community_messages';
  idColumn: 'session_id' | 'community_id';
  channelPrefix: string;
  fetchMessages: (
    sourceId: string,
    opts?: { beforeCreatedAt?: string | null; pageSize?: number },
  ) => Promise<{ messages: T[]; hasMore: boolean }>;
  sendMessage: (
    sourceId: string,
    userId: string,
    content: string,
    replyToId?: string | null,
    replyTarget?: ReplyTargetInfo | null,
  ) => Promise<T | null>;
};

export type ChatThread<T extends ChatMessageBase> = {
  messages: T[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadOlder: () => void;
  sendMessage: (content: string, replyToId?: string | null) => Promise<T | null>;
  refresh: () => void;
  unreadCount: number;
  firstUnreadIndex: number | null;
  markRead: () => void;
};

export function useChat<T extends ChatMessageBase>(
  config: ChatSourceConfig<T>,
  userId?: string,
  subscribe = true,
  senderProfile?: SenderProfile | null,
): ChatThread<T> {
  const { sourceId, table, idColumn, channelPrefix, fetchMessages, sendMessage } = config;
  const [messages, setMessages] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadingOlderRef = useRef(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [firstUnreadIndex, setFirstUnreadIndex] = useState<number | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingTempsRef = useRef<Map<string, { content: string; replyToId: string | null }>>(
    new Map(),
  );

  const appendMessage = useCallback((message: T) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  const load = useCallback(async () => {
    if (!sourceId) return;
    setLoading(true);
    try {
      const { messages: page, hasMore: more } = await fetchMessages(sourceId);
      setMessages(page);
      setHasMore(more);

      if (userId) {
        const [cursor, count] = await Promise.all([
          fetchChatReadCursor(idColumn, sourceId, userId),
          fetchChatUnreadCount(table, idColumn, sourceId, userId),
        ]);
        setUnreadCount(count);
        // Index (in the ascending messages list) of the oldest unread message.
        // null means the user is fully caught up (scroll to bottom on open).
        if (cursor) {
          const cursorTime = new Date(cursor).getTime();
          const idx = page.findIndex((m) => new Date(m.created_at).getTime() > cursorTime);
          setFirstUnreadIndex(idx >= 0 ? idx : null);
        } else {
          setFirstUnreadIndex(null);
        }
      }
    } catch (e) {
      console.error('Failed to load chat:', e);
    } finally {
      setLoading(false);
    }
  }, [sourceId, fetchMessages, idColumn, table, userId]);

  // Loads the page of messages older than the oldest one already shown and
  // prepends it, so scrolling up paginates instead of pulling the whole chat.
  const loadOlder = useCallback(async () => {
    if (!sourceId || !hasMore || loadingOlderRef.current) return;
    if (messages.length === 0) return;

    loadingOlderRef.current = true;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const { messages: olderPage, hasMore: more } = await fetchMessages(sourceId, {
        beforeCreatedAt: oldest.created_at,
      });
      const known = new Set(messages.map((m) => m.id));
      const older = olderPage.filter((m) => !known.has(m.id));
      setMessages((prev) => [...older, ...prev]);
      setHasMore(more);
      // The "New messages" divider stays attached to the same message when
      // pages are prepended above it.
      if (older.length > 0) {
        setFirstUnreadIndex((idx) => (idx == null ? idx : idx + older.length));
      }
    } catch (e) {
      console.error('Failed to load older chat messages:', e);
    } finally {
      loadingOlderRef.current = false;
      setLoadingMore(false);
    }
  }, [sourceId, hasMore, messages, fetchMessages]);

  // Mark the whole thread as read (cursor -> now). Keeps the unread divider in
  // place for the current session; the badge/count resets immediately.
  const markRead = useCallback(() => {
    if (!sourceId || !userId) return;
    upsertChatReadCursor(idColumn, sourceId, userId)
      .then(() => setUnreadCount(0))
      .catch((e) => console.error('Failed to mark chat read:', e));
  }, [sourceId, userId, idColumn]);

  // Subscribes to realtime for this chat, then closes any OTHER channel still
  // registered for the same chat ("close existing, open current"). The unique
  // topic suffix guarantees supabase.channel() never returns an already
  // subscribed channel (supabase reuses channels by topic and .on() throws once
  // subscribed), and the close loop guarantees only the most recent screen keeps
  // a live channel for the chat at any time.
  const subscribeToChannel = useCallback(() => {
    if (!sourceId || !subscribe) return;

    const topic = `${channelPrefix}${sourceId}-${++chatChannelSeq}`;
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter: `${idColumn}=eq.${sourceId}`,
        },
        (payload) => {
          const raw = normalizeChatMessage(payload.new as T);

          // Realtime rows carry the sender snapshot but no reply_to join. If this
          // row matches an optimistic temp message we already placed, upgrade that
          // temp in-place (swap tempId -> real id, keep its sending mark) instead
          // of adding a second bubble.
          let matchedTempId: string | null = null;
          for (const [tempId, info] of pendingTempsRef.current.entries()) {
            if (
              info.content === raw.content &&
              (info.replyToId ?? null) === (raw.reply_to_id ?? null)
            ) {
              matchedTempId = tempId;
              pendingTempsRef.current.delete(tempId);
              break;
            }
          }

          if (matchedTempId) {
            // The row is now committed in the DB (realtime fires on commit) —
            // flip clock -> tick immediately so the user sees the write confirm
            // without waiting for the send() response round-trip.
            setMessages((prev) =>
              prev.map((m) =>
                m.id === matchedTempId
                  ? { ...m, id: raw.id, status: 'delivered' }
                  : m,
              ),
            );
          } else {
            appendMessage(raw);
            // Live badge: new messages from other people bump the unread count.
            // The popup resets it to 0 via markRead on open / on scroll.
            if (raw.sender_id && raw.sender_id !== userId) {
              setUnreadCount((prev) => prev + 1);
            }
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    const base = `realtime:${channelPrefix}${sourceId}-`;
    for (const other of supabase.getChannels()) {
      if (other !== channel && other.topic.startsWith(base)) {
        supabase.removeChannel(other);
      }
    }
  }, [sourceId, subscribe, table, idColumn, channelPrefix, appendMessage, userId]);

  useEffect(() => {
    if (!sourceId || !subscribe) return;
    subscribeToChannel();
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sourceId, subscribe, subscribeToChannel]);

  useFocusEffect(
    useCallback(() => {
      if (!sourceId) return;
      load();
      // A newer screen for the same chat may have closed our channel
      // (close-then-open); restore the live subscription when we regain focus.
      if (
        subscribe &&
        (!channelRef.current || !supabase.getChannels().includes(channelRef.current))
      ) {
        subscribeToChannel();
      }
    }, [load, sourceId, subscribe, subscribeToChannel]),
  );

  const send = useCallback(
    async (content: string, replyToId?: string | null): Promise<T | null> => {
      if (!sourceId || !userId) return null;

      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const replyTarget = replyToId ? messages.find((m) => m.id === replyToId) ?? null : null;

      const temp = {
        id: tempId,
        sender_id: userId,
        content,
        created_at: new Date().toISOString(),
        reply_to_id: replyToId ?? null,
        sender: senderProfile
          ? { id: senderProfile.id, username: senderProfile.username, avatar_url: senderProfile.avatar_url }
          : { id: userId, username: 'You', avatar_url: null },
        reply_to: replyTarget
          ? {
              id: replyTarget.id,
              sender_id: replyTarget.sender_id ?? null,
              content: replyTarget.content,
              sender:
                replyTarget.sender ??
                (replyTarget.sender_id === userId
                  ? senderProfile
                    ? { id: senderProfile.id, username: senderProfile.username, avatar_url: senderProfile.avatar_url }
                    : { id: userId, username: 'You', avatar_url: null }
                  : null),
            }
          : null,
        status: 'sending',
        tempId,
      } as T;

      setMessages((prev) => [...prev, temp]);
      pendingTempsRef.current.set(tempId, { content, replyToId: replyToId ?? null });

      try {
        const msg = await sendMessage(
          sourceId,
          userId,
          content,
          replyToId,
          replyTarget
            ? {
                id: replyTarget.id,
                senderId: replyTarget.sender_id ?? null,
                content: replyTarget.content,
              }
            : null,
        );
        pendingTempsRef.current.delete(tempId);
        setMessages((prev) => {
          if (!msg) return prev.filter((m) => m.id !== tempId);
          // Swap the temp bubble for the real row IN PLACE so content never
          // shrinks then regrows mid-send — a remove-then-append here would make
          // the pinned list visibly jump up while the scroll animation runs.
          if (prev.some((m) => m.id === msg.id)) {
            // Realtime already upgraded the temp to the real id: just mark it sent.
            return prev.map((m) => (m.id === msg.id ? { ...m, status: 'delivered' } : m));
          }
          return prev.map((m) => (m.id === tempId ? { ...msg, status: 'delivered' } : m));
        });
        return msg;
      } catch (e) {
        pendingTempsRef.current.delete(tempId);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw e;
      }
    },
    [sourceId, userId, messages, senderProfile, sendMessage],
  );

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadOlder,
    sendMessage: send,
    refresh: load,
    unreadCount,
    firstUnreadIndex,
    markRead,
  };
}
