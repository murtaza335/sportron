import { useNotificationsContext } from '@/contexts/NotificationsContext';
import type { InAppNotification } from '@/types';

export type Notification = InAppNotification;

export function useNotifications() {
  return useNotificationsContext();
}
