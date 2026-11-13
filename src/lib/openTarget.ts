import type { Href } from 'expo-router';
import { Linking, Platform } from 'react-native';

import { SHARE_ORIGIN } from '@/lib/share';

type PushRouter = { push: (href: Href) => void };

/**
 * Generic deep-link router (B8): one entry point for every announcement CTA, push and banner.
 *  - `/some/route`                     -> in-app route
 *  - `https://sportron.app/some/route` -> in-app route (same path)
 *  - any other `https://…` URL         -> opened externally
 * Anything else (javascript:, data:, http:, malformed) is ignored. Returns true when handled.
 */
export async function openTarget(router: PushRouter, target?: string | null): Promise<boolean> {
  const url = (target ?? '').trim();
  if (!url) return false;

  if (url.startsWith('/') && !url.startsWith('//')) {
    router.push(url as Href);
    return true;
  }
  if (url.startsWith(`${SHARE_ORIGIN}/`) || url === SHARE_ORIGIN) {
    router.push((url.slice(SHARE_ORIGIN.length) || '/') as Href);
    return true;
  }
  if (/^https:\/\//i.test(url)) {
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        await Linking.openURL(url);
      }
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
