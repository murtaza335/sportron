import { Share2 } from 'lucide-react-native';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { share, type SharePayload } from '@/lib/share';

/** Icon button that opens the native share sheet (or web share / copy fallback) with `payload`. */
export function ShareButton({
  payload,
  size = 22,
  style,
  label = 'Share',
}: {
  payload: SharePayload | (() => SharePayload);
  size?: number;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => {
        haptics.light();
        share(typeof payload === 'function' ? payload() : payload);
      }}
      style={({ pressed }) => [{ padding: 4 }, style, pressed && { opacity: 0.6 }]}
    >
      <Share2 size={size} color={theme.text} strokeWidth={2} />
    </Pressable>
  );
}
