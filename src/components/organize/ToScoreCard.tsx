import { useRouter } from 'expo-router';
import { ChevronRight, ClipboardList } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useFlag } from '@/contexts/RemoteConfigContext';
import { useScoringMatches } from '@/hooks/useScoringMatches';
import { useTheme } from '@/hooks/use-theme';
import { tournamentRoutes } from '@/lib/tournamentRoutes';

/** Tournaments tab: "To score · N matches". Only for people who have something to score. */
export function ToScoreCard() {
  const theme = useTheme();
  const router = useRouter();
  const scorerUi = useFlag('organizations', false);
  const liveOn = useFlag('live_scoring', false);
  const { matches } = useScoringMatches(scorerUi && liveOn);
  if (!matches || matches.length === 0) return null;
  const live = matches.filter((m) => m.live_state).length;
  return (
    <Card style={styles.card} onPress={() => router.push(tournamentRoutes.toScore())}>
      <ClipboardList size={24} color={theme.accent} />
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: '800' }}>
          To score · {matches.length} {matches.length === 1 ? 'match' : 'matches'}
        </ThemedText>
        {live > 0 && (
          <ThemedText variant="caption" muted>
            {live} live now
          </ThemedText>
        )}
      </View>
      <ChevronRight size={20} color={theme.textSecondary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: Spacing.md },
});
