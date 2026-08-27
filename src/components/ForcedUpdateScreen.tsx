import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';

const DARK_BG = '#0F1115';
const ACCENT = '#00A8B5';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const SURFACE = '#181B22';

type ForcedUpdateScreenProps = {
  message: string;
  storeUrl: string;
};

export function ForcedUpdateScreen({ message, storeUrl }: ForcedUpdateScreenProps) {
  const handleUpdate = () => {
    if (storeUrl) {
      Linking.openURL(storeUrl);
    }
  };

  return (
    <View style={styles.container}>
      {/* Large download icon */}
      <View style={styles.iconContainer}>
        <Text style={styles.iconArrow} selectable={false}>
          {'\u2B07\uFE0F'}
        </Text>
      </View>

      <Text style={styles.title}>Update Required</Text>
      <Text style={styles.message}>{message}</Text>

      {storeUrl ? (
        <Pressable
          onPress={handleUpdate}
          style={({ pressed }) => [
            styles.updateButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Update app">
          <Text style={styles.updateLabel}>Update App</Text>
        </Pressable>
      ) : (
        <Text style={styles.noStore}>Please update from your app store.</Text>
      )}
    </View>
  );
}

const ICON_SIZE = 120;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BG,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: ICON_SIZE + 40,
    height: ICON_SIZE + 40,
    borderRadius: (ICON_SIZE + 40) / 2,
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  iconArrow: {
    fontSize: ICON_SIZE,
    lineHeight: ICON_SIZE + 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: TEXT_PRIMARY,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: Spacing.md,
  },
  message: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
    color: TEXT_SECONDARY,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  updateButton: {
    minWidth: 160,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  updateLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  noStore: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
});
