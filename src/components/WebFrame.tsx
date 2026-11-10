import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/contexts/ThemeContext';

/** Width of the phone-like column the app is centred in on wide web windows. */
export const WEB_COLUMN_WIDTH = 560;
const WIDE_BREAKPOINT = 760;

/** Style for popups that render outside the root column (RN Modal) so they match its width. */
export const webColumnStyle = Platform.OS === 'web'
  ? ({ width: '100%', maxWidth: WEB_COLUMN_WIDTH, alignSelf: 'center' } as const)
  : undefined;

/** Web only: on wide windows centre the app in a phone-width column; elsewhere render children as-is. */
export function WebFrame({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width <= WIDE_BREAKPOINT) return <>{children}</>;
  return (
    <View style={[styles.page, { backgroundColor: theme.backgroundElement }]}>
      <View
        style={[
          styles.column,
          { backgroundColor: theme.background, borderColor: theme.border },
        ]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: WEB_COLUMN_WIDTH,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
