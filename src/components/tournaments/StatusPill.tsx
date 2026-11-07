import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { tint, type StatusTone } from '@/lib/tournamentFormat';

/** Small capsule: tinted background (~15%), coloured text (PLAN §11 status mapping). */
export function StatusPill({ tone }: { tone: StatusTone }) {
  const theme = useTheme();
  const color = theme[tone.token];
  return (
    <View style={[styles.pill, { backgroundColor: tint(color) }]}>
      <ThemedText variant="caption" style={[styles.text, { color }]}>
        {tone.label}
      </ThemedText>
    </View>
  );
}

/** Neutral capsule (sport names, counts). */
export function InfoPill({ label }: { label: string }) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  return (
    <View style={[styles.pill, { backgroundColor: isDark ? 'rgba(0, 168, 181, 0.15)' : 'rgba(0, 168, 181, 0.1)' }]}>
      <ThemedText variant="caption" style={[styles.text, { color: isDark ? '#2DD4BF' : '#00A8B5' }]}>
        {label}
      </ThemedText>
    </View>
  );
}

/** Role tag (ADMIN / PLAYING), same recipe as the community member tag. */
export function RoleTag({ label }: { label: string }) {
  const theme = useTheme();
  const isDark = theme.resolvedColorScheme === 'dark';
  return (
    <View style={[styles.pill, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)' }]}>
      <ThemedText variant="caption" style={[styles.text, { color: isDark ? '#34D399' : '#10B981' }]}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  text: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
