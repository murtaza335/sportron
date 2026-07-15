import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { useAuth } from '@/contexts/AuthContext';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useMatchStats } from '@/hooks/useMatchStats';
import { useTheme } from '@/hooks/use-theme';

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <Card style={styles.statCard}>
      <ThemedText variant="hero" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText variant="label" muted>
        {label}
      </ThemedText>
    </Card>
  );
}

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, profile } = useAuth();
  const { stats, loading, refresh } = useMatchStats(user?.id);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText variant="caption" muted>
            Welcome back
          </ThemedText>
          <ThemedText variant="title">{profile?.display_name ?? 'Player'}</ThemedText>
        </View>

        <View style={styles.statsSection}>
          <ThemedText variant="label" muted>
            Match summary
          </ThemedText>

          {loading ? (
            <ActivityIndicator color={theme.text} style={styles.loader} />
          ) : (
            <View style={styles.statsRow}>
              <StatBlock label="Matches" value={stats.total} />
              <StatBlock label="Wins" value={stats.wins} />
              <StatBlock label="Losses" value={stats.losses} />
            </View>
          )}
        </View>

        <View style={styles.center}>
          <Pressable
            onPress={() => router.push('/add-match')}
            style={({ pressed }) => [
              styles.addButton,
              {
                backgroundColor: theme.text,
                opacity: pressed ? 0.85 : 1,
              },
            ]}>
            <Plus size={48} color={theme.background} strokeWidth={2.5} />
          </Pressable>
          <ThemedText variant="label" muted style={styles.addLabel}>
            Add match
          </ThemedText>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
  },
  header: {
    paddingTop: Spacing.lg,
    gap: Spacing.xs,
  },
  statsSection: {
    marginTop: Spacing.xl,
    gap: Spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.lg,
  },
  statValue: {
    fontSize: 36,
    lineHeight: 40,
  },
  loader: {
    marginVertical: Spacing.xl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  addButton: {
    width: 120,
    height: 120,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: {
    letterSpacing: 1,
  },
});
