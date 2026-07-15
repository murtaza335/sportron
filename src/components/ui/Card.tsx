import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type CardProps = ViewProps & {
  bordered?: boolean;
};

export function Card({ style, bordered = true, ...rest }: CardProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.background,
          borderColor: theme.border,
        },
        bordered && styles.bordered,
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
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  bordered: {
    borderWidth: 1,
  },
});
