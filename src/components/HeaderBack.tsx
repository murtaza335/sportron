import { useRouter, usePathname, type Href } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { goBack } from '@/lib/nav';

/**
 * Folder segments that are NOT screens by themselves: `/community`, `/tournament` and `/module`
 * have no page of their own (only `/community/<id>`, `/tournament/<id>`, `/module/<moduleId>`).
 * When the parent of a path is one of these, go to the screen that lists them instead.
 *
 * RULE for new pages: every route's computed parent must be a real screen. If you add a route
 * folder that has no index screen (e.g. `src/app/foo/[id].tsx` without `foo/index.tsx`), add it
 * here — otherwise Back after a refresh/shared link lands on "Unmatched Route".
 */
const NON_SCREEN_PARENTS: Record<string, string> = {
  '/community': '/',
  '/tournament': '/tournaments',
  '/profile': '/',
  '/auth': '/',
};

/** Parent route of a path (`/community/1/members` -> `/community/1`), `/` at the top. */
function parentOf(pathname: string): Href {
  const parts = pathname.split('/').filter(Boolean);
  parts.pop();
  // `/tournament/<id>/module` is not a screen (modules live at `/module/<moduleId>`): skip it.
  if (parts[parts.length - 1] === 'module') parts.pop();
  const parent = parts.length ? `/${parts.join('/')}` : '/';
  return (NON_SCREEN_PARENTS[parent] ?? parent) as Href;
}

/**
 * Shared header back button (A6/A7). Drawn with a lucide icon coloured from the theme, so it stays
 * visible in dark mode on web (the default PNG icon is tinted unreliably there), and falls back to
 * `fallback` (default: the parent route) when there is no history (refresh, direct/shared link).
 */
export function HeaderBack({ fallback }: { fallback?: Href }) {
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => goBack(router, fallback ?? parentOf(pathname))}
      hitSlop={12}
      style={({ pressed }) => [
        { marginRight: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
        pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 0.92 }] },
      ]}
    >
      <ChevronLeft size={24} color={theme.text} />
    </Pressable>
  );
}
