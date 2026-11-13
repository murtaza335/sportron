import { Flag } from 'lucide-react-native';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';

import { useCanReport } from '@/hooks/useCanReport';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { openReport } from '@/lib/reportStore';
import type { ReportTarget } from '@/lib/reports';

/** Small flag icon button for headers. Renders nothing when reporting is off or the target is the viewer's own. */
export function ReportButton({
  target,
  ownerId,
  size = 22,
  style,
}: {
  target: ReportTarget;
  ownerId?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const can = useCanReport(ownerId);
  if (!can) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Report ${target.label}`}
      hitSlop={12}
      onPress={() => {
        haptics.light();
        openReport(target);
      }}
      style={({ pressed }) => [{ padding: 4 }, style, pressed && { opacity: 0.6 }]}
    >
      <Flag size={size} color={theme.text} strokeWidth={2} />
    </Pressable>
  );
}
