import { Platform } from 'react-native';

export const Palette = {
  black: '#000000',
  white: '#FFFFFF',
  border: '#E5E5E5',
  muted: '#737373',
  surface: '#FAFAFA',
} as const;

export const Colors = {
  light: {
    text: Palette.black,
    textSecondary: Palette.muted,
    background: Palette.white,
    backgroundElement: Palette.surface,
    backgroundSelected: Palette.border,
    border: Palette.border,
    tabBar: Palette.white,
    tabBarActive: Palette.black,
    tabBarInactive: Palette.muted,
  },
  dark: {
    text: Palette.white,
    textSecondary: Palette.muted,
    background: Palette.black,
    backgroundElement: '#111111',
    backgroundSelected: '#1A1A1A',
    border: '#2A2A2A',
    tabBar: Palette.black,
    tabBarActive: Palette.white,
    tabBarInactive: Palette.muted,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'system-ui, -apple-system, sans-serif',
    serif: 'Georgia, serif',
    rounded: 'system-ui, sans-serif',
    mono: 'monospace',
  },
});

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
} as const;

export const BottomTabInset = Platform.select({ ios: 88, android: 72 }) ?? 0;
export const MaxContentWidth = 600;
