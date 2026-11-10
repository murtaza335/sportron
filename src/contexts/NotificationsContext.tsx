import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { InAppNotification } from '@/types';
import { useAppForeground } from '@/hooks/useAppForeground';

type NotificationsContextValue = {
  notifications: InAppNotification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (notificationId: string) => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

const NOTIFICATIONS_LIMIT = 100;

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const profileId = profile?.id;
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  // Unread rows that are NOT in the loaded page (the inbox is capped at NOTIFICATIONS_LIMIT):
  // measured at fetch time so the badge does not undercount beyond the cap.
  const [olderUnread, setOlderUnread] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!profileId) return;

    setLoading(true);
    try {
      const [{ data, error }, { count: unreadTotal }] = await Promise.all([
        supabase
          .from('in_app_notifications')
          .select('*')
          .eq('user_id', profileId)
          .order('created_at', { ascending: false })
          .limit(NOTIFICATIONS_LIMIT),
        supabase
          .from('in_app_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profileId)
          .eq('read', false),
      ]);

      if (error) throw error;

      const rows = data || [];
      setNotifications(rows);
      const loadedUnread = rows.filter((n) => !n.read).length;
      setOlderUnread(Math.max(0, (unreadTotal ?? loadedUnread) - loadedUnread));
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n)),
    );

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!profileId) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setOlderUnread(0);

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .update({ read: true })
        .eq('user_id', profileId)
        .eq('read', false);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  }, [profileId]);

  const deleteNotification = useCallback(async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));

    try {
      const { error } = await supabase
        .from('in_app_notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }, []);

  // Fetch on mount + keep a shared realtime subscription (INSERT/UPDATE/DELETE)
  useEffect(() => {
    if (!profileId) return;

    const timeoutId = setTimeout(() => {
      fetchNotifications();
    }, 0);

    const channel = supabase
      .channel(`notifications-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${profileId}`,
        },
        (payload) => {
          const newNotification = payload.new as InAppNotification;
          setNotifications((prev) =>
            prev.some((n) => n.id === newNotification.id)
              ? prev
              : [newNotification, ...prev],
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${profileId}`,
        },
        (payload) => {
          const updated = payload.new as InAppNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === updated.id ? updated : n)),
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'in_app_notifications',
          filter: `user_id=eq.${profileId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
        },
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(channel);
    };
  }, [profileId, fetchNotifications]);

  // Refetch on resume: realtime events are missed while the app is backgrounded.
  useAppForeground(() => {
    fetchNotifications();
  }, !!profileId);

  // Derived from the shared list so every read/insert/delete stays in sync
  const unreadCount = notifications.filter((n) => !n.read).length + olderUnread;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotificationsContext must be used within NotificationsProvider');
  }
  return ctx;
}
