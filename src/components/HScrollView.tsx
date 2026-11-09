import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { Platform, ScrollView, type ScrollViewProps } from 'react-native';

import { isFinePointer } from '@/lib/webKeys';

/**
 * Horizontal ScrollView that also works with a mouse: on web the wheel scrolls it sideways
 * (while it can still move that way) and desktop gets a visible scrollbar. Native = plain ScrollView.
 */
export const HScrollView = forwardRef<ScrollView, ScrollViewProps>(function HScrollView(
  { showsHorizontalScrollIndicator, ...props },
  forwardedRef,
) {
  const innerRef = useRef<ScrollView | null>(null);

  const setRef = useCallback(
    (node: ScrollView | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = (innerRef.current as any)?.getScrollableNode?.() as HTMLElement | undefined;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = el.scrollLeft + e.deltaY;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
      el.scrollLeft = Math.max(0, Math.min(max, next));
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <ScrollView
      {...props}
      ref={setRef}
      horizontal
      showsHorizontalScrollIndicator={
        Platform.OS === 'web' ? isFinePointer() : (showsHorizontalScrollIndicator ?? false)
      }
    />
  );
});
