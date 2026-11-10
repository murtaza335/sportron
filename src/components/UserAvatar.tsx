import { useEffect } from 'react';
import { Image, View } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';
import { Duration } from '@/lib/motion';

const NO_PROFILE_PHOTO = require('@/assets/images/no-profile-photo.png');
const AnimatedImage = Animated.createAnimatedComponent(Image);

type UserAvatarProps = {
  avatarUrl?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  backgroundColor?: string;
};

export function UserAvatar({
  avatarUrl,
  size = 40,
  style,
  imageStyle,
  backgroundColor,
}: UserAvatarProps) {
  const theme = useTheme();
  const opacity = useSharedValue(0);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));

  useEffect(() => {
    opacity.set(0);
  }, [avatarUrl, opacity]);

  const containerStyle: StyleProp<ViewStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: backgroundColor ?? theme.backgroundElement,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    style,
  ];

  const imgStyle: StyleProp<ImageStyle> = [
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
    imageStyle,
  ];

  return (
    <View style={containerStyle}>
      {/* placeholder always underneath; the real photo fades in over it on load */}
      <Image source={NO_PROFILE_PHOTO} style={[imgStyle, avatarUrl ? { position: 'absolute' } : null]} resizeMode="cover" />
      {avatarUrl ? (
        <AnimatedImage
          source={{ uri: avatarUrl }}
          style={[imgStyle, fade]}
          resizeMode="cover"
          onLoad={() => {
            opacity.set(withTiming(1, { duration: Duration.base }));
          }}
        />
      ) : null}
    </View>
  );
}
