import { Minus, Plus } from 'lucide-react-native';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ScoreCounterProps = {
  label: string;
  score: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onScorePress?: () => void;
  onScoreChange?: (score: number) => void;
};

export function ScoreCounter({ label, score, onIncrement, onDecrement, onScorePress, onScoreChange }: ScoreCounterProps) {
  const theme = useTheme();

  const handleDirectInput = () => {
    if (!onScoreChange) return;
    
    const defaultValue = score.toString();
    const title = `Set ${label} Score`;
    const message = 'Enter the score directly';

    if (Platform.OS === 'ios') {
      Alert.prompt(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set', onPress: (value: string | undefined) => { const n = parseInt(value ?? '', 10); if (!isNaN(n) && n >= 0) onScoreChange(n); } },
        ],
        'plain-text',
        defaultValue,
        'numeric'
      );
    } else {
      // Android doesn't support Alert.prompt with numeric keyboard easily, use a custom approach
      Alert.prompt(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set', onPress: (value: string | undefined) => { const n = parseInt(value ?? '', 10); if (!isNaN(n) && n >= 0) onScoreChange(n); } },
        ],
        'plain-text',
        defaultValue
      );
    }
  };

  const handleScorePress = () => {
    if (onScoreChange) {
      handleDirectInput();
    } else if (onScorePress) {
      onScorePress();
    }
  };

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

        <Pressable onPress={handleScorePress} style={({ pressed }) => [styles.scoreTouchArea, pressed && { opacity: 0.7 }]} hitSlop={16}>
          <ThemedText variant="hero" style={styles.score}>
            {score}
          </ThemedText>
        </Pressable>

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
  scoreTouchArea: {
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
});
