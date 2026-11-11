import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  getAnnouncementState,
  markAnnouncementDismissed,
  markAnnouncementShown,
} from '@/lib/announcementState';
import { openTarget } from '@/lib/openTarget';
import {
  fetchActiveAnnouncements,
  recordAnnouncementEvent,
  type Announcement,
  type AnnouncementPlacement,
} from '@/services/announcements';

// One fetch shared by every host on screen (60s cache) and a per-launch "already counted a view" set.
let cache: { at: number; data: Announcement[] } | null = null;
let inflight: Promise<Announcement[]> | null = null;
const viewedThisLaunch = new Set<string>();

async function loadAnnouncements(): Promise<Announcement[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  if (!inflight) {
    inflight = fetchActiveAnnouncements()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * Renders the highest-priority active announcement for `placement` (A3): a modal once after launch for
 * `app_open_modal`, otherwise a dismissible banner. Dismissals + show counts live per device.
 * Renders nothing when there is nothing to show (or the RPC isn't deployed yet).
 */
export function AnnouncementHost({ placement }: { placement: AnnouncementPlacement }) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [item, setItem] = useState<Announcement | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const all = await loadAnnouncements();
      for (const a of all.filter((x) => x.placement === placement)) {
        const st = await getAnnouncementState(a.id);
        if (st.dismissed) continue;
        if (a.max_shows != null && st.shows >= a.max_shows) continue;
        if (cancelled) return;
        setItem(a);
        if (!viewedThisLaunch.has(a.id)) {
          viewedThisLaunch.add(a.id);
          markAnnouncementShown(a.id);
          recordAnnouncementEvent(a.id, 'view');
        }
        return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, placement]);

  const dismiss = useCallback(() => {
    if (!item) return;
    setOpen(false);
    markAnnouncementDismissed(item.id);
    recordAnnouncementEvent(item.id, 'dismiss');
  }, [item]);

  const onCta = useCallback(async () => {
    if (!item) return;
    recordAnnouncementEvent(item.id, 'click');
    if (placement === 'app_open_modal') setOpen(false);
    await openTarget(router, item.cta_url);
  }, [item, router, placement]);

  if (!item || !open) return null;

  const content = (
    <>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      <View style={styles.textBlock}>
        <ThemedText variant="heading" style={{ fontWeight: '700' }}>
          {item.title}
        </ThemedText>
        {item.body ? <ThemedText muted>{item.body}</ThemedText> : null}
        {item.cta_url && item.cta_label ? (
          <Button label={item.cta_label} onPress={onCta} buttonStyle={{ alignSelf: 'flex-start' }} />
        ) : null}
      </View>
    </>
  );

  const closeBtn = item.dismissible ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
      onPress={dismiss}
      hitSlop={12}
      style={[styles.close, { backgroundColor: theme.background }]}
    >
      <X size={16} color={theme.text} />
    </Pressable>
  ) : null;

  if (placement === 'app_open_modal') {
    return (
      <Modal transparent visible animationType="fade" onRequestClose={item.dismissible ? dismiss : undefined}>
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {content}
            {closeBtn}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {content}
      {closeBtn}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 150 },
  textBlock: { padding: Spacing.md, gap: Spacing.sm },
  close: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
