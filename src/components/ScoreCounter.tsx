import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScoreCounterProps = {
  label: string;
  score: number;
  onIncrement: () => void;
  onDecrement: () => void;
};

export function ScoreCounter({ label, score, onIncrement, onDecrement }: ScoreCounterProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ThemedText variant="label" muted style={styles.label}>
        {label}
      </ThemedText>

      <View style={[styles.scoreBlock, { borderColor: theme.border, backgroundColor: theme.background }]}>
        <Pressable
          onPress={onDecrement}
          style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          hitSlop={12}>
          <Minus size={28} color={theme.text} strokeWidth={2.5} />
        </Pressable>

        <ThemedText variant="hero" style={styles.score}>
          {score}
        </ThemedText>

        <Pressable
          onPress={onIncrement}
          style={({ pressed }) => [styles.control, pressed && styles.pressed]}
          hitSlop={12}>
          <Plus size={28} color={theme.text} strokeWidth={2.5} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  label: {
    textAlign: 'center',
  },
  scoreBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xl,
    minHeight: 144,
  },
  control: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  score: {
    minWidth: 80,
    textAlign: 'center',
    fontSize: 64,
    lineHeight: 68,
  },
});
