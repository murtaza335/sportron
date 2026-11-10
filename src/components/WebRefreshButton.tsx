import { RefreshCw } from 'lucide-react-native';
import { useState, useSyncExternalStore } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/motion/PressableScale';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Duration, RM } from '@/lib/motion';
import { getWebRefresh, subscribeWebRefresh } from '@/lib/webRefresh';

/** Web only: small round button that refreshes the list on the focused screen (no pull-to-refresh on web). */
export function WebRefreshButton() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const refresh = useSyncExternalStore(subscribeWebRefresh, getWebRefresh);
  const [spinning, setSpinning] = useState(false);

  if (Platform.OS !== 'web' || !refresh) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(Duration.base).reduceMotion(RM)}
      exiting={FadeOut.duration(Duration.fast).reduceMotion(RM)}
      style={[styles.wrap, { bottom: insets.bottom + 76 }]}>
      <PressableScale
        accessibilityLabel="Refresh"
        onPress={() => {
          refresh();
          setSpinning(true);
          setTimeout(() => setSpinning(false), 700);
        }}
        style={[styles.button, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <RefreshCw size={18} color={spinning ? theme.accent : theme.textSecondary} />
      </PressableScale>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.md, zIndex: 150 },
  button: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
