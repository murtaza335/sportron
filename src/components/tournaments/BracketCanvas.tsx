import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react-native';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  runOnJS,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const PAD: number = Spacing.md;
const MAX_SCALE = 2.5;
const MIN_SCALE_FLOOR = 0.2;
const ZOOM_STEP = 1.35;
const ANIM_MS = 180;

export type BracketCanvasHandle = {
  /** Bring the content x position (unscaled px) to the left edge of the viewport. */
  focusX: (x: number) => void;
};

/**
 * Pan (any direction, incl. diagonal, with momentum) + pinch-zoom viewport for the bracket.
 * Only transforms are animated, on the UI thread; content is laid out once at scale 1.
 */
export const BracketCanvas = forwardRef<BracketCanvasHandle, {
  contentWidth: number;
  contentHeight: number;
  children: ReactNode;
  /** true while a finger is on the canvas — the parent page scroll must not steal the gesture. */
  onTouchLock?: (locked: boolean) => void;
}>(function BracketCanvas({ contentWidth, contentHeight, children, onTouchLock }, ref) {
  const theme = useTheme();
  const { height: windowH } = useWindowDimensions();
  const [vw, setVw] = useState(0);

  // Never leave the page scroll locked if the bracket goes away mid-touch (tab switch).
  useEffect(() => () => onTouchLock?.(false), [onTouchLock]);

  const vh = Math.round(Math.min(Math.max(contentHeight * 0.6 + PAD * 2, 300), windowH * 0.68));
  const minScale = useMemo(() => {
    if (!vw) return 1;
    const fit = Math.min((vw - PAD * 2) / contentWidth, (vh - PAD * 2) / contentHeight);
    return Math.max(MIN_SCALE_FLOOR, Math.min(1, fit));
  }, [vw, vh, contentWidth, contentHeight]);

  const scale = useSharedValue(1);
  const tx = useSharedValue<number>(PAD);
  const ty = useSharedValue<number>(PAD);
  const lastFocalX = useSharedValue(0);
  const lastFocalY = useSharedValue(0);

  // Allowed translation range for a scale: content smaller than the viewport is pinned to the top-left padding.
  const clampX = (x: number, s: number) => {
    'worklet';
    const w = contentWidth * s;
    return w + PAD * 2 <= vw ? PAD : Math.min(PAD, Math.max(vw - w - PAD, x));
  };
  const clampY = (y: number, s: number) => {
    'worklet';
    const h = contentHeight * s;
    return h + PAD * 2 <= vh ? PAD : Math.min(PAD, Math.max(vh - h - PAD, y));
  };

  const pan = Gesture.Pan()
    .maxPointers(1)
    .minDistance(6)
    .onChange((e) => {
      const s = scale.get();
      tx.set(clampX(tx.get() + e.changeX, s));
      ty.set(clampY(ty.get() + e.changeY, s));
    })
    .onEnd((e) => {
      const s = scale.get();
      const w = contentWidth * s;
      const h = contentHeight * s;
      if (w + PAD * 2 > vw) tx.set(withDecay({ velocity: e.velocityX, clamp: [vw - w - PAD, PAD], deceleration: 0.996 }));
      if (h + PAD * 2 > vh) ty.set(withDecay({ velocity: e.velocityY, clamp: [vh - h - PAD, PAD], deceleration: 0.996 }));
    });

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      lastFocalX.set(e.focalX);
      lastFocalY.set(e.focalY);
    })
    .onChange((e) => {
      const s = scale.get();
      const next = Math.min(MAX_SCALE, Math.max(minScale, s * e.scaleChange));
      // The content point that was under the previous focal point stays under the current one.
      const px = (lastFocalX.get() - tx.get()) / s;
      const py = (lastFocalY.get() - ty.get()) / s;
      scale.set(next);
      tx.set(clampX(e.focalX - px * next, next));
      ty.set(clampY(e.focalY - py * next, next));
      lastFocalX.set(e.focalX);
      lastFocalY.set(e.focalY);
    });

  // Never activates; only reports finger down/up so the page's vertical scroll (and pull-to-refresh)
  // can be switched off while the bracket is being touched.
  const touchLock = Gesture.Manual()
    .onTouchesDown(() => {
      if (onTouchLock) runOnJS(onTouchLock)(true);
    })
    .onTouchesUp((e) => {
      if (onTouchLock && e.numberOfTouches === 0) runOnJS(onTouchLock)(false);
    })
    .onTouchesCancelled(() => {
      if (onTouchLock) runOnJS(onTouchLock)(false);
    });

  const gesture = Gesture.Simultaneous(touchLock, pan, pinch);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: scale.get() }],
  }));

  const zoomTo = useCallback(
    (target: number) => {
      const s = scale.get();
      const next = Math.min(MAX_SCALE, Math.max(minScale, target));
      // Zoom about the viewport centre.
      const cx = vw / 2;
      const cy = vh / 2;
      const px = (cx - tx.get()) / s;
      const py = (cy - ty.get()) / s;
      const w = contentWidth * next;
      const h = contentHeight * next;
      const nx = w + PAD * 2 <= vw ? PAD : Math.min(PAD, Math.max(vw - w - PAD, cx - px * next));
      const ny = h + PAD * 2 <= vh ? PAD : Math.min(PAD, Math.max(vh - h - PAD, cy - py * next));
      scale.set(withTiming(next, { duration: ANIM_MS }));
      tx.set(withTiming(nx, { duration: ANIM_MS }));
      ty.set(withTiming(ny, { duration: ANIM_MS }));
    },
    [scale, tx, ty, minScale, vw, vh, contentWidth, contentHeight],
  );

  useImperativeHandle(
    ref,
    () => ({
      focusX: (x: number) => {
        const s = scale.get();
        const w = contentWidth * s;
        const target = w + PAD * 2 <= vw ? PAD : Math.min(PAD, Math.max(vw - w - PAD, PAD - x * s));
        tx.set(withTiming(target, { duration: ANIM_MS * 1.5 }));
      },
    }),
    [scale, tx, vw, contentWidth],
  );

  const btn = [styles.btn, { backgroundColor: theme.backgroundElement, borderColor: theme.border }];
  return (
    // overflow:hidden lives on a plain View: the gesture root view does not clip on Android, which let the
    // bracket paint over the header and tabs above it.
    <View
      style={[styles.viewport, { height: vh, borderColor: theme.border }]}
      onLayout={(e) => setVw(e.nativeEvent.layout.width)}
      collapsable={false}
    >
      <GestureHandlerRootView style={styles.fill}>
        {/* The detector wraps the FULL viewport (not the scaled content) so touches register on empty
            space too, e.g. after zooming out. */}
        <GestureDetector gesture={gesture}>
          <View style={styles.fill} collapsable={false}>
            <Animated.View
              style={[{ width: contentWidth, height: contentHeight, transformOrigin: 'top left' }, animatedStyle]}
            >
              {children}
            </Animated.View>
          </View>
        </GestureDetector>
        <View style={styles.controls} pointerEvents="box-none">
          <Pressable style={btn} onPress={() => zoomTo(scale.get() * ZOOM_STEP)} accessibilityRole="button" accessibilityLabel="Zoom in" hitSlop={4}>
            <ZoomIn size={18} color={theme.text} strokeWidth={2} />
          </Pressable>
          <Pressable style={btn} onPress={() => zoomTo(scale.get() / ZOOM_STEP)} accessibilityRole="button" accessibilityLabel="Zoom out" hitSlop={4}>
            <ZoomOut size={18} color={theme.text} strokeWidth={2} />
          </Pressable>
          <Pressable style={btn} onPress={() => zoomTo(minScale)} accessibilityRole="button" accessibilityLabel="Fit whole bracket" hitSlop={4}>
            <Maximize2 size={16} color={theme.text} strokeWidth={2} />
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  viewport: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md },
  controls: { position: 'absolute', right: 8, bottom: 8, gap: 6 },
  btn: {
    width: 36,
    height: 36,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
