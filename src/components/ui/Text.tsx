import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  variant?: 'body' | 'caption' | 'label' | 'heading' | 'title' | 'hero';
  muted?: boolean;
  ellipsizeMode?: 'head' | 'middle' | 'tail' | 'clip';
  selectable?: boolean;
};

export function ThemedText({ style, variant = 'body', muted = false, ellipsizeMode, selectable = false, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: muted ? theme.textSecondary : theme.text },
        variant === 'body' && styles.body,
        variant === 'caption' && styles.caption,
        variant === 'label' && styles.label,
        variant === 'heading' && styles.heading,
        variant === 'title' && styles.title,
        variant === 'hero' && styles.hero,
        style,
      ]}
      ellipsizeMode={ellipsizeMode}
      selectable={selectable}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  heading: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
  },
  hero: {
    fontSize: 48,
    lineHeight: 52,
    fontWeight: '800',
    letterSpacing: -1,
  },
});
