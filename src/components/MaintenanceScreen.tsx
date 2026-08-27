import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { fetchMaintenanceMode } from '@/services/config';
import { useCallback, useState } from 'react';

const DARK_BG = '#0F1115';
const ACCENT = '#00A8B5';
const TEXT_PRIMARY = '#F8FAFC';
const TEXT_SECONDARY = '#94A3B8';
const SURFACE = '#181B22';

const DEFAULT_MESSAGE = 'We are currently down for maintenance.\nPlease check back soon.';

export function MaintenanceScreen() {
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const retry = useCallback(async () => {
    setChecking(true);
    const config = await fetchMaintenanceMode();
    if (!config.enabled) {
      // Maintenance ended — the parent RootLayout will re-render
      // and swap to the normal provider tree. Nothing to do here.
      return;
    }
    if (config.message) setMessage(config.message);
    const now = new Date();
    setLastChecked(
      now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    );
    setChecking(false);
  }, []);

  return (
    <View style={styles.container}>
      {/* Large wrench icon */}
      <View style={styles.iconContainer}>
        <Text style={styles.iconWrench} selectable={false}>
          {'\u{1F527}'}
        </Text>
      </View>

      <Text style={styles.title}>Under Maintenance</Text>
      <Text style={styles.message}>{message}</Text>

      {checking ? (
        <ActivityIndicator size="large" color={ACCENT} style={styles.loader} />
      ) : (
        <Pressable
          onPress={retry}
          style={({ pressed }) => [
            styles.retryButton,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry">
          <Text style={styles.retryLabel}>Retry</Text>
        </Pressable>
      )}

      {lastChecked && (
        <Text style={styles.lastChecked}>Last checked: {lastChecked}</Text>
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
  iconWrench: {
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
  loader: {
    marginTop: Spacing.md,
  },
  retryButton: {
    minWidth: 160,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333A48',
    backgroundColor: SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  retryLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  lastChecked: {
    marginTop: Spacing.lg,
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
});
