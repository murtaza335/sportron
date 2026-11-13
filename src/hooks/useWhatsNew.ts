import { useRemoteConfig } from '@/contexts/RemoteConfigContext';
import { WHATS_NEW_CONTENT, WHATS_NEW_VERSION, type WhatsNewItem } from '@/lib/whatsNew';

type RemoteWhatsNew = { version?: string; items?: WhatsNewItem[] } | null;

/**
 * What's New content + version (B3). Comes from the remote `whats_new` config when set, otherwise the
 * bundled list — so new notes (and the "unread dot") ship without bumping a version in three places.
 */
export function useWhatsNew(): { version: string; items: WhatsNewItem[] } {
  const remote = useRemoteConfig<RemoteWhatsNew>('whats_new', null);
  const items = Array.isArray(remote?.items) && remote.items.length > 0 ? remote.items : WHATS_NEW_CONTENT;
  return { version: remote?.version || WHATS_NEW_VERSION, items };
}
