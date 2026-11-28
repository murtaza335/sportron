import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Shared bits of the Organize screens. */

export function SuspendedBanner() {
  const theme = useTheme();
  return (
    <View style={[styles.banner, { backgroundColor: `${theme.error}26` }]}>
      <ThemedText style={{ color: theme.error, fontWeight: '800' }}>This organization’s account is paused</ThemedText>
      <ThemedText variant="caption">
        Published tournaments stay visible, but nothing can be changed or scored. Contact Sportron.
      </ThemedText>
    </View>
  );
}

/** Load problem; says so when saved data is still on screen. */
export function LoadError({ message, saved, onRetry }: { message: string; saved: boolean; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.error, { borderColor: theme.error }]}>
      <ThemedText style={{ fontWeight: '700' }}>{saved ? 'Offline — showing saved data' : 'Couldn’t load this'}</ThemedText>
      <ThemedText variant="caption" muted>{message}</ThemedText>
      <Button label="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}

export function LinkRow({
  title,
  sub,
  right,
  onPress,
  icon,
}: {
  title: string;
  sub?: string | null;
  right?: React.ReactNode;
  icon?: React.ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText style={{ fontWeight: '700' }}>{title}</ThemedText>
        {sub ? <ThemedText variant="caption" muted>{sub}</ThemedText> : null}
      </View>
      {right}
      <ChevronRight size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Radius.lg, padding: Spacing.md, gap: 4 },
  error: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, minHeight: 64 },
});
