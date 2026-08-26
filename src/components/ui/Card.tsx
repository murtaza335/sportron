import { StyleSheet, View, type ViewStyle, type ViewProps } from 'react-native';

import { Radius, Spacing, Shadows } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  bordered?: boolean;
};

export function Card({ style, bordered = true, ...rest }: CardProps) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  const shadow = isDark ? Shadows.dark.card : Shadows.light.card;

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
