import { Lightbulb, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { Collapsible } from '@/components/motion/Collapsible';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import { TIPS, useTip, type TipId } from '@/lib/tips';

/** Inline, dismissible first-run tip. Renders nothing once dismissed. */
export function TipCard({ id }: { id: TipId }) {
  const theme = useTheme();
  const { visible, dismiss } = useTip(id);
  const tip = TIPS[id];
  return (
    <Collapsible open={visible}>
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <Lightbulb size={18} color={theme.accent} strokeWidth={2.2} style={styles.icon} />
        <View style={styles.text}>
          <ThemedText variant="body" style={styles.title}>
            {tip.title}
          </ThemedText>
          <ThemedText variant="caption" style={{ color: theme.textSecondary }}>
            {tip.body}
          </ThemedText>
          <Pressable
            onPress={() => {
              haptics.light();
              dismiss();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            style={styles.gotIt}>
            <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
              Got it
            </ThemedText>
          </Pressable>
        </View>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel="Dismiss tip">
          <X size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  icon: { marginTop: 2 },
  text: { flex: 1, gap: 2 },
  title: { fontWeight: '700' },
  gotIt: { alignSelf: 'flex-start', marginTop: Spacing.xs },
});
