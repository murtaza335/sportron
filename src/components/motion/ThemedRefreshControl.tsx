import { RefreshControl, type RefreshControlProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';

/** RefreshControl with theme colours and a light haptic when a refresh starts. */
export function ThemedRefreshControl({ onRefresh, ...rest }: RefreshControlProps) {
  const theme = useTheme();
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
