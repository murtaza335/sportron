import { useEffect } from 'react';
import { Image, type ImageProps } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Duration } from '@/lib/motion';

const AnimatedImage = Animated.createAnimatedComponent(Image);

/** Image that fades in once loaded (put a placeholder background colour on its style). */
export function FadeImage({ onLoad, style, source, ...rest }: ImageProps) {
  const opacity = useSharedValue(0);
  const uri = typeof source === 'object' && source && 'uri' in source ? source.uri : undefined;
  useEffect(() => {
    opacity.set(0);
  }, [uri, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <AnimatedImage
      {...rest}
      source={source}
      style={[style, fade]}
      onLoad={(e) => {
        opacity.set(withTiming(1, { duration: Duration.base }));
        onLoad?.(e);
      }}
    />
  );
}
