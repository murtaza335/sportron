import { Globe, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { haptics } from '@/lib/haptics';
import { Duration, Springs } from '@/lib/motion';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrivacyToggleProps = {
  isPublic: boolean;
  onChange: (isPublic: boolean) => void;
};

export function PrivacyToggle({ isPublic, onChange }: PrivacyToggleProps) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(isPublic ? 0 : 1);

  useEffect(() => {
    pos.set(reduced ? withTiming(isPublic ? 0 : 1, { duration: Duration.fast }) : withSpring(isPublic ? 0 : 1, Springs.snappy));
  }, [isPublic, reduced, pos]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: (width / 2) * pos.value }] }));
  const choose = (value: boolean) => {
    if (value !== isPublic) haptics.selection();
    onChange(value);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.track, { borderColor: theme.border }]} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <Animated.View pointerEvents="none" style={[styles.thumb, { backgroundColor: theme.text }, thumb]} />
        <Pressable
          onPress={() => choose(true)}
          style={styles.option}>
          <Globe size={16} color={isPublic ? theme.background : theme.text} />
          <ThemedText
            variant="caption"
            style={{ color: isPublic ? theme.background : theme.text, fontWeight: '700' }}>
            Public
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => choose(false)}
          style={styles.option}>
          <Lock size={16} color={!isPublic ? theme.background : theme.text} />
          <ThemedText
            variant="caption"
            style={{ color: !isPublic ? theme.background : theme.text, fontWeight: '700' }}>
            Private
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  thumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '50%',
  },
  track: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  option: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
});
