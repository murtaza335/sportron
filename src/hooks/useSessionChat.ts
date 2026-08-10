import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase';
import {
  fetchSessionMessageById,
  fetchSessionMessages,
  sendSessionMessage,
} from '@/services/chat';
import type { SessionChatMessage } from '@/types';

export function useSessionChat(sessionId: string | null, userId?: string, subscribe = true) {
  const [messages, setMessages] = useState<SessionChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const appendMessage = useCallback((message: SessionChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  const hydrateMessage = useCallback((messageId: string) => {
    fetchSessionMessageById(messageId).then((msg) => {
      if (msg) {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      }
    });
  }, []);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await fetchSessionMessages(sessionId);
      setMessages(data);
    } catch (e) {
      console.error('Failed to load session chat:', e);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !subscribe) return;

    channelRef.current = supabase
      .channel(`session-chat-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_messages',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const raw = payload.new as SessionChatMessage;
          appendMessage(raw);
          hydrateMessage(raw.id);
        },
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [sessionId, subscribe, appendMessage, hydrateMessage]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionId) return;
      load();
    }, [load, sessionId]),
  );

  const sendMessage = useCallback(
    async (content: string): Promise<SessionChatMessage | null> => {
      if (!sessionId || !userId) return null;
      setSending(true);
      try {
        const message = await sendSessionMessage(sessionId, userId, content);
        appendMessage(message);
        return message;
      } finally {
        setSending(false);
      }
    },
    [sessionId, userId, appendMessage],
  );

  return { messages, loading, sending, sendMessage, refresh: load };
}
