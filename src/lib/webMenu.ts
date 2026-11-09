import { Platform } from 'react-native';

/**
 * Right-click support for rows whose menu is otherwise long-press only.
 * Spread on a Pressable; returns nothing on native. `handler` receives the DOM mouse event.
 */
export function webContextMenuProps(handler: (e: { pageX: number; pageY: number }) => void) {
  if (Platform.OS !== 'web') return {};
  return {
    onContextMenu: (e: { preventDefault: () => void; pageX: number; pageY: number }) => {
      e.preventDefault();
      handler(e);
    },
  } as Record<string, unknown>;
}
