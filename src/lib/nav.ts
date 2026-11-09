import type { Href } from 'expo-router';

type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: Href) => void;
};

/**
 * `router.back()` does nothing on web after a refresh or when a screen was opened from a link
 * (no history). Go back when we can, otherwise land on `fallback`.
 */
export function goBack(router: BackRouter, fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
