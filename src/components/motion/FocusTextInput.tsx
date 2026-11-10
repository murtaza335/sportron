import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { Duration } from '@/lib/motion';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/** Drop-in TextInput whose border colour animates to the accent focus colour (error wins when `invalid`). */
export const FocusTextInput = forwardRef<TextInput, TextInputProps & { invalid?: boolean }>(function FocusTextInput(
  { style, invalid, onFocus, onBlur, ...rest },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const border = useAnimatedStyle(
    () => ({
      borderColor: withTiming(invalid ? theme.error : focused ? theme.inputBorderFocus : theme.border, {
        duration: Duration.fast,
      }),
    }),
    [invalid, focused, theme.error, theme.inputBorderFocus, theme.border],
  );
  return (
    <AnimatedTextInput
      ref={ref as never}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      style={[style, border]}
      {...rest}
    />
  );
});
