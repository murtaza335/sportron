import { StyleSheet, View, type ViewStyle, type ViewProps } from 'react-native';

import { PressableScale } from '@/components/motion/PressableScale';
import { Radius, Spacing, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  bordered?: boolean;
  /** When set, the card is tappable with spring press feedback. */
  onPress?: () => void;
};

export function Card({ style, bordered = true, onPress, ...rest }: CardProps) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  const shadow = isDark ? Shadows.dark.card : Shadows.light.card;

  const cardStyle = [
    styles.card,
    {
      backgroundColor: theme.backgroundElement,
      borderColor: theme.border,
    },
    bordered && styles.bordered,
    shadow as ViewStyle,
    style,
  ];

  if (onPress) {
    return (
      <PressableScale onPress={onPress} scaleTo={0.98} style={cardStyle as never}>
        {rest.children}
      </PressableScale>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
        bordered && styles.bordered,
        shadow as ViewStyle,
        style,
      ]}
      {...rest}
    />
  );
}

export function Divider({ spacing = Spacing.md }: { spacing?: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        height: 1,
        backgroundColor: theme.border,
        marginVertical: spacing,
      }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  bordered: {
    borderWidth: 1,
  },
});
