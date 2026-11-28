import { useRouter } from 'expo-router';
import { Building2, ChevronRight, Medal } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useMyWork } from '@/hooks/useMyWork';
import { useTheme } from '@/hooks/use-theme';
import { tournamentRoutes } from '@/lib/tournamentRoutes';

function Row({ icon, title, sub, onPress }: { icon: React.ReactNode; title: string; sub?: string | null; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Card style={styles.card} onPress={onPress}>
      {icon}
      <View style={{ flex: 1 }}>
        <ThemedText style={{ fontWeight: '800' }}>{title}</ThemedText>
        {sub ? (
          <ThemedText variant="caption" muted>
            {sub}
          </ThemedText>
        ) : null}
      </View>
      <ChevronRight size={20} color={theme.textSecondary} />
    </Card>
  );
}

/** Tournaments tab: "Organize" (organization people) and "My sports" (sport managers). */
export function OrganizeCards() {
  const theme = useTheme();
  const router = useRouter();
  const { orgs, sports } = useMyWork();
  if (orgs.length === 0 && sports.length === 0) return null;
  const today = sports.reduce((n, s) => n + s.today.length, 0);
  return (
    <>
      {orgs.map((o) => (
        <Row
          key={o.id}
          icon={<Building2 size={24} color={theme.accent} />}
          title={`Organize · ${o.short_name || o.name}`}
          sub={
            o.suspended
              ? 'Account paused'
              : `${o.tournament_count} ${o.tournament_count === 1 ? 'tournament' : 'tournaments'}`
          }
          onPress={() => router.push(tournamentRoutes.organize(o.id))}
        />
      ))}
      {sports.length > 0 && (
        <Row
          icon={<Medal size={24} color={theme.accent} />}
          title={`My sports · ${today} ${today === 1 ? 'match' : 'matches'} today`}
          sub={`${sports.length} ${sports.length === 1 ? 'sport' : 'sports'}`}
          onPress={() => router.push(tournamentRoutes.mySports())}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, marginBottom: Spacing.md },
});
