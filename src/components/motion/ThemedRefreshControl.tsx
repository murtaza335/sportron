import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, RefreshControl, type RefreshControlProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { registerWebRefresh } from '@/lib/webRefresh';

/** RefreshControl with theme colours and a light haptic when a refresh starts (on web: feeds the refresh button). */
export function ThemedRefreshControl({ onRefresh, ...rest }: RefreshControlProps) {
  const theme = useTheme();
  const focused = useIsFocused();
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });
  const hasHandler = !!onRefresh;

  // Web has no pull-to-refresh: park this screen's refresh for the shared <WebRefreshButton />.
  useEffect(() => {
    if (Platform.OS !== 'web' || !focused || !hasHandler) return;
    return registerWebRefresh(() => onRefreshRef.current?.());
  }, [focused, hasHandler]);

  return (
    <RefreshControl
      colors={[theme.accent]}
      tintColor={theme.accent}
      progressBackgroundColor={theme.backgroundElement}
      {...rest}
      onRefresh={
        onRefresh
          ? () => {
              haptics.light();
              onRefresh();
            }
          : undefined
      }
    />
  );
}
