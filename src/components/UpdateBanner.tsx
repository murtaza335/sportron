import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Download, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isVersionSatisfied } from '@/services/config';
import { fetchRecommendedVersion, type RecommendedVersion } from '@/services/remoteConfig';

const KEY = 'update-banner-dismissed-version';

/**
 * Soft "Update available" nudge (B6): shown when `site_config.recommended_app_version` is newer than this
 * build. Dismissible per recommended version; the forced-update gate is separate and unchanged.
 */
export function UpdateBanner() {
  const theme = useTheme();
  const [rec, setRec] = useState<RecommendedVersion | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    (async () => {
      const r = await fetchRecommendedVersion();
      if (!r || cancelled) return;
      const current = Constants.expoConfig?.version ?? '0.0.0';
      if (isVersionSatisfied(current, r.version)) return;
      let dismissed: string | null = null;
      try {
        dismissed = await AsyncStorage.getItem(KEY);
      } catch {
        // ignore
      }
      if (dismissed === r.version || cancelled) return;
      setRec(r);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rec) return null;

  const dismiss = () => {
    AsyncStorage.setItem(KEY, rec.version).catch(() => {});
    setRec(null);
  };

  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <Download size={18} color={theme.accent} />
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: '700' }}>Update available</ThemedText>
        <ThemedText variant="caption" muted>
          {rec.message || `Version ${rec.version} has new features and fixes.`}
        </ThemedText>
      </View>
      {rec.storeUrl ? (
        <Pressable onPress={() => Linking.openURL(rec.storeUrl).catch(() => {})} hitSlop={8}>
          <ThemedText style={{ color: theme.accent, fontWeight: '700' }}>Update</ThemedText>
        </Pressable>
      ) : null}
      <Pressable onPress={dismiss} hitSlop={12} accessibilityLabel="Dismiss">
        <X size={16} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
