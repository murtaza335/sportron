import { useRouter } from 'expo-router';
import { Radio } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { LiveStatus } from '@/constants/liveColors';
import { usePendingLive } from '@/hooks/useLiveSync';
import { useTheme } from '@/hooks/use-theme';
import { tournamentRoutes } from '@/lib/tournamentRoutes';

/**
 * "You're scoring Ali vs Bilal — Resume": shown while this phone holds an unfinished live match, so a killed app is
 * one tap from where it was. Hidden when there is nothing to resume (or live scoring is unused).
 */
export function ResumeScoringBanner({ tournamentId }: { tournamentId?: string }) {
  const theme = useTheme();
  const router = useRouter();
  const pending = usePendingLive().filter((p) => !tournamentId || p.tournamentId === tournamentId);
  if (pending.length === 0) return null;
  return (
    <View style={{ gap: Spacing.sm }}>
      {pending.map((p) => (
        <Pressable
          key={p.matchId}
          onPress={() => router.push(tournamentRoutes.score(p.tournamentId, p.moduleId, p.matchId))}
          accessibilityRole="button"
          accessibilityLabel={`Resume scoring ${p.label}`}
          style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: LiveStatus.live }]}
        >
          <Radio size={22} color={LiveStatus.live} />
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: '800' }} numberOfLines={1}>
              {p.hasFinish ? 'Result waiting to upload' : 'You’re scoring a live match'}
            </ThemedText>
            <ThemedText variant="caption" muted numberOfLines={1}>
              {p.label}
              {p.pending > 0 ? ` · ${p.pending} change${p.pending === 1 ? '' : 's'} not sent yet` : ''}
            </ThemedText>
          </View>
          <ThemedText style={{ color: theme.accent, fontWeight: '800' }}>Resume</ThemedText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md, borderRadius: Radius.md, borderWidth: 1.5 },
});
