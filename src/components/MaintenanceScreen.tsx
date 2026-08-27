import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useMaintenance } from '@/contexts/MaintenanceContext';

const DEFAULT_MESSAGE = 'We are currently down for maintenance.\nPlease check back soon.';

export function MaintenanceScreen() {
  const theme = useTheme();
  const { message, loading, retry } = useMaintenance();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ThemedText style={styles.icon}>🔧</ThemedText>
      <ThemedText variant="title" style={styles.title}>
        Under Maintenance
      </ThemedText>
      <ThemedText variant="body" muted style={styles.message}>
        {message || DEFAULT_MESSAGE}
      </ThemedText>

      {loading ? (
        <ActivityIndicator size="large" color={theme.accent} style={styles.loader} />
      ) : (
        <Button
          label="Retry"
          variant="secondary"
          onPress={retry}
          buttonStyle={styles.retryButton}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  icon: {
    fontSize: 64,
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  message: {
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  loader: {
    marginTop: Spacing.md,
  },
  retryButton: {
    minWidth: 160,
  },
});
