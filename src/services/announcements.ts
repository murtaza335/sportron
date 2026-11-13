import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export type AnnouncementPlacement = 'app_open_modal' | 'home_banner' | 'tournaments_banner' | 'sessions_banner';

export type Announcement = {
  id: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_url: string | null;
  placement: AnnouncementPlacement;
  priority: number;
  dismissible: boolean;
  max_shows: number | null;
  ends_at: string | null;
};

/** Active announcements for this platform/app version. Fail-soft: errors (e.g. RPC not deployed) mean "none". */
export async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  try {
    const { data, error } = await supabase.rpc('get_active_announcements', {
      p_platform: Platform.OS,
      p_app_version: Constants.expoConfig?.version ?? '0.0.0',
    });
    if (error) return [];
    return (data ?? []) as Announcement[];
  } catch {
    return [];
  }
}

/** Fire-and-forget analytics (view / click / dismiss). Never throws. */
export async function recordAnnouncementEvent(id: string, event: 'view' | 'click' | 'dismiss'): Promise<void> {
  try {
    await supabase.rpc('record_announcement_event', { p_announcement_id: id, p_event: event });
  } catch {
    // analytics are best-effort
  }
}
