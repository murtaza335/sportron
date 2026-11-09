import { Easing, LinearTransition, ReduceMotion } from 'react-native-reanimated';

/** Single source of truth for motion. Change values only here. */
export const Duration = {
  instant: 100, // press-down, colour flips
  fast: 160, // micro feedback, icon swaps, fades out
  base: 240, // element enter/exit, crossfades
  slow: 320, // sheets, larger moves
  screen: 350, // stack screen transitions
  celebrate: 900, // confetti / milestone only
} as const;

export const Springs = {
  /** snappy, no visible overshoot: buttons, toggles, segment indicator */
  snappy: { damping: 40, stiffness: 420, mass: 1 },
  /** default UI spring: cards, sheets settling, tab icons */
  gentle: { damping: 34, stiffness: 300, mass: 1 },
  /** subtle overshoot (kept small on purpose): like pop, badge pop, streak increment, send bubble */
  bouncy: { damping: 36, stiffness: 380, mass: 0.8 },
  /** sheet open/close */
  sheet: { damping: 38, stiffness: 340, mass: 1 },
} as const;

export const Easings = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  emphasizedDecel: Easing.bezier(0.05, 0.7, 0.1, 1),
  emphasizedAccel: Easing.bezier(0.3, 0, 0.8, 0.15),
} as const;

export const PRESS_SCALE = 0.97;
export const PRESS_SCALE_SMALL = 0.92; // icon buttons
export const STAGGER_MS = 45;
export const STAGGER_MAX_ITEMS = 8;
export const RM = ReduceMotion.System;

/** Non-bouncy layout shift for list reorder / insert / remove. */
export const LayoutShift = LinearTransition.duration(Duration.base).easing(Easings.standard).reduceMotion(RM);
