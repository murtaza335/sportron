import { Platform, ViewStyle } from 'react-native';

// ─── Raw Palette ─────────────────────────────────────────────────────────────
export const Palette = {
  black: '#000000',
  white: '#FFFFFF',
  border: '#E5E5E5',
  muted: '#737373',
  surface: '#FAFAFA',
} as const;

// ─── Dark Mode Palette ───────────────────────────────────────────────────────
const DarkColors = {
  // Base surfaces (elevation hierarchy)
  background: '#0F1115',           // Level 0 – rich dark slate
  backgroundElement: '#181B22',    // Level 1 – card surface
  backgroundSelected: '#222632',   // Level 2 – elevated/highlighted surface

  // Borders & dividers
  border: '#262A34',               // crisp card border
  borderMuted: '#333A48',          // muted/overlay border

  // Text
  text: '#F8FAFC',                 // primary – 95% opacity white
  textSecondary: '#94A3B8',        // slate gray, WCAG 4.5:1

  // Tab bar
  tabBar: '#0F1115',
  tabBarActive: '#00A8B5',         // Vibrant Cyan-Teal
  tabBarInactive: '#64748B',       // Slate Gray

  // Brand accents
  accent: '#00A8B5',               // Primary – Vibrant Cyan-Teal
  accentSecondary: '#10B981',      // Secondary – Emerald Green

  // Semantic status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#00A8B5',

  // Chat bubble (sender's own)
  chatBubbleMine: '#006B75',       // Deep Teal
  chatBubbleMineText: '#F8FAFC',

  // Input fields
  inputBackground: '#181B22',
  inputBorder: '#333A48',
  inputBorderFocus: '#00A8B5',
  placeholder: 'rgba(148, 163, 184, 0.5)',
} as const;

// ─── Light Mode Palette ──────────────────────────────────────────────────────
const LightColors = {
  // Base surfaces (elevation hierarchy)
  background: '#F8FAFC',           // Level 0 – off-white canvas
  backgroundElement: '#FFFFFF',    // Level 1 – card surface (pure white)
  backgroundSelected: '#F1F5F9',   // Level 2 – elevated/highlighted surface

  // Borders & dividers
  border: '#E2E8F0',               // crisp card border
  borderMuted: '#CBD5E1',          // muted/overlay border

  // Text
  text: '#0F172A',                 // primary – deep slate
  textSecondary: '#64748B',        // neutral gray

  // Tab bar
  tabBar: '#F8FAFC',
  tabBarActive: '#00A8B5',         // Vibrant Cyan-Teal
  tabBarInactive: '#64748B',       // Slate Gray

  // Brand accents
  accent: '#00A8B5',               // Primary – Vibrant Cyan-Teal
  accentSecondary: '#10B981',      // Secondary – Emerald Green

  // Semantic status
  success: '#10B981',
  warning: '#D97706',
  error: '#DC2626',
  info: '#00A8B5',

  // Chat bubble (sender's own)
  chatBubbleMine: '#006B75',       // Deep Teal
  chatBubbleMineText: '#F8FAFC',

  // Input fields
  inputBackground: '#FFFFFF',
  inputBorder: '#CBD5E1',
  inputBorderFocus: '#00A8B5',
  placeholder: 'rgba(100, 116, 139, 0.5)',
} as const;

// ─── Unified Colors ──────────────────────────────────────────────────────────
export const Colors = {
  light: { ...LightColors },
  dark: { ...DarkColors },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// ─── Shadows (platform-aware, mode-aware) ────────────────────────────────────
export const Shadows = {
  light: {
    card: Platform.select<ViewStyle>({
      web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.04)' },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.04,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
    elevated: Platform.select<ViewStyle>({
      web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.08)' },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.08,
        shadowRadius: 24,
        elevation: 4,
      },
    }),
  },
  dark: {
    card: Platform.select<ViewStyle>({
      web: { boxShadow: '0px 4px 12px rgba(0,0,0,0.3)' },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 2,
      },
    }),
    elevated: Platform.select<ViewStyle>({
      web: { boxShadow: '0px 8px 24px rgba(0,0,0,0.5)' },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
        elevation: 4,
      },
    }),
  },
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────
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
    sans: 'system-ui, -apple-system, Inter, SF Pro Text, Roboto, sans-serif',
    serif: 'Georgia, serif',
    rounded: 'system-ui, sans-serif',
    mono: 'monospace',
  },
});

export const Typography = {
  /** Section headers – weight 700, primary text */
  header: {
    fontWeight: '700' as const,
    letterSpacing: -0.2,
  },
  /** Card titles – weight 600, primary text */
  cardTitle: {
    fontWeight: '600' as const,
    letterSpacing: -0.2,
  },
  /** Body / descriptions – weight 400, secondary text */
  body: {
    fontWeight: '400' as const,
  },
  /** Meta labels / micro-copy – weight 500, 12sp, secondary text */
  meta: {
    fontWeight: '500' as const,
    fontSize: 12,
  },
} as const;

// ─── Spacing ─────────────────────────────────────────────────────────────────
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 9999,   // capsule / pill shape
} as const;

// ─── Constants ───────────────────────────────────────────────────────────────
export const BottomTabInset = Platform.select({ ios: 88, android: 72 }) ?? 0;
export const MaxContentWidth = 600;
