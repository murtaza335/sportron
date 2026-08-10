import { Image, View } from 'react-native';
import type { ImageStyle, StyleProp, ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const NO_PROFILE_PHOTO = require('@/assets/images/no-profile-photo.png');

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
      <Image
        source={avatarUrl ? { uri: avatarUrl } : NO_PROFILE_PHOTO}
        style={imgStyle}
        resizeMode="cover"
      />
    </View>
  );
}
