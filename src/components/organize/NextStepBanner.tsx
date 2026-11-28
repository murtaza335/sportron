import { useRouter } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { sportNextStep } from '@/lib/nextStep';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { fetchModuleScorers } from '@/services/tournaments';
import type { TournamentDetail } from '@/types';

/** The one thing to do next, for the people running an organization tournament. */
export function NextStepBanner({ detail }: { detail: TournamentDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const t = detail.tournament;
  const running = detail.modules.find((m) => m.status === 'in_progress');
  const [noScorers, setNoScorers] = useState<{ id: string; none: boolean } | null>(null);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    fetchModuleScorers(running.id)
      .then((r) => alive && setNoScorers({ id: running.id, none: r.length === 0 }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [running]);

  if (t.status === 'completed' || t.status === 'cancelled') return null;

  let step: { label: string; onPress: () => void } | null = null;
  if (detail.modules.length === 0) {
    step = { label: 'Add a sport', onPress: () => router.push(tournamentRoutes.moduleForm(t.id)) };
  } else if (t.status === 'draft') {
    step = { label: 'Publish when you’re ready', onPress: () => router.push(tournamentRoutes.manage(t.id)) };
  } else {
    for (const m of detail.modules) {
      const next = sportNextStep({ status: m.status, entry_count: m.entry_count });
      if (!next) continue;
      step = {
        label: `${next.label}: ${m.name}`,
        onPress: () =>
          router.push(
            next.target === 'seeding'
              ? tournamentRoutes.seeding(t.id, m.id)
              : next.target === 'manage'
                ? tournamentRoutes.moduleManage(t.id, m.id)
                : tournamentRoutes.module(t.id, m.id),
          ),
      };
      break;
    }
    if (!step && running && noScorers?.id === running.id && noScorers.none) {
      step = { label: `Appoint scorers: ${running.name}`, onPress: () => router.push(tournamentRoutes.moduleManage(t.id, running.id)) };
    }
  }
  if (!step) return null;

  return (
    <Pressable
      onPress={step.onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.box, { borderColor: theme.accent, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <ThemedText variant="label" muted>Next step</ThemedText>
        <ThemedText style={{ fontWeight: '800' }}>{step.label}</ThemedText>
      </View>
      <ArrowRight size={20} color={theme.accent} strokeWidth={2.5} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 2, borderRadius: Radius.lg, padding: Spacing.md },
});
