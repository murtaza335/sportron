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

export type ChatSourceConfig<T extends ChatMessageBase> = {
  sourceId: string | null;
  table: 'session_messages' | 'community_messages';
  idColumn: 'session_id' | 'community_id';
  channelPrefix: string;
  fetchMessages: (sourceId: string) => Promise<T[]>;
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
      const data = await fetchMessages(sourceId);
      setMessages(data);

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
          const idx = data.findIndex((m) => new Date(m.created_at).getTime() > cursorTime);
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

  // Mark the whole thread as read (cursor -> now). Keeps the unread divider in
  // place for the current session; the badge/count resets immediately.
  const markRead = useCallback(() => {
    if (!sourceId || !userId) return;
    upsertChatReadCursor(idColumn, sourceId, userId)
      .then(() => setUnreadCount(0))
      .catch((e) => console.error('Failed to mark chat read:', e));
  }, [sourceId, userId, idColumn]);

  useEffect(() => {
    if (!sourceId || !subscribe) return;

    channelRef.current = supabase
      .channel(`${channelPrefix}${sourceId}`)
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
            setMessages((prev) =>
              prev.map((m) => (m.id === matchedTempId ? { ...m, id: raw.id } : m)),
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

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sourceId, table, idColumn, channelPrefix, subscribe, appendMessage, userId]);

  useFocusEffect(
    useCallback(() => {
      if (!sourceId) return;
      load();
    }, [load, sourceId]),
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
          const next = prev.filter((m) => m.id !== tempId && m.id !== msg?.id);
          return msg ? [...next, { ...msg, status: 'delivered' }] : next;
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
    sendMessage: send,
    refresh: load,
    unreadCount,
    firstUnreadIndex,
    markRead,
  };
}
