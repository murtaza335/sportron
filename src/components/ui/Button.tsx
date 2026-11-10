import { ActivityIndicator, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { PressableScale } from '@/components/motion/PressableScale';
import type { HapticKind } from '@/lib/haptics';
import { Duration, RM } from '@/lib/motion';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  icon?: React.ReactNode;
  buttonStyle?: StyleProp<ViewStyle>;
  haptic?: HapticKind;
};

export function Button({
  label,
  variant = 'primary',
  loading = false,
  icon,
  disabled,
  buttonStyle,
  haptic,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const backgroundColor =
    variant === 'primary' ? theme.text : variant === 'secondary' ? theme.backgroundElement : 'transparent';
  const textColor = variant === 'primary' ? theme.background : theme.text;
  const borderColor = variant === 'secondary' ? theme.border : variant === 'ghost' ? theme.border : 'transparent';

  return (
    <PressableScale
      disabled={isDisabled}
      haptic={haptic ?? (variant === 'primary' ? 'light' : undefined)}
      style={(state) => [
        styles.button,
        {
          backgroundColor,
          borderColor,
          opacity: isDisabled ? 0.5 : 1,
        },
        buttonStyle,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}>
      {/* Content stays mounted (invisible) while loading so the width never jumps */}
      <View style={[styles.content, loading && styles.hidden]}>
        {icon}
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.label, { color: textColor }]}>{label}</Text>
      </View>
      {loading ? (
        <Animated.View
          style={StyleSheet.absoluteFill}
          entering={FadeIn.duration(Duration.fast).reduceMotion(RM)}
          exiting={FadeOut.duration(Duration.fast).reduceMotion(RM)}>
          <View style={styles.spinner}>
            <ActivityIndicator color={textColor} size="small" />
          </View>
        </Animated.View>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 56,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  hidden: {
    opacity: 0,
  },
  spinner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
