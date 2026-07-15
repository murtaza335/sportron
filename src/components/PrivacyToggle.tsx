import { Globe, Lock } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type PrivacyToggleProps = {
  isPublic: boolean;
  onChange: (isPublic: boolean) => void;
};

export function PrivacyToggle({ isPublic, onChange }: PrivacyToggleProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.track, { borderColor: theme.border }]}>
        <Pressable
          onPress={() => onChange(true)}
          style={[
            styles.option,
            isPublic && { backgroundColor: theme.text },
          ]}>
          <Globe size={16} color={isPublic ? theme.background : theme.text} />
          <ThemedText
            variant="caption"
            style={{ color: isPublic ? theme.background : theme.text, fontWeight: '700' }}>
            Public
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => onChange(false)}
          style={[
            styles.option,
            !isPublic && { backgroundColor: theme.text },
          ]}>
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
