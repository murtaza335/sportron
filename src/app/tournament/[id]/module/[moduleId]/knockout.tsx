import { ArrowDown, ArrowUp, TriangleAlert } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentModule } from '@/hooks/useTournamentModule';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { sameGroupConflicts, tint } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { buildKnockoutStage, previewKnockoutQualifiers, resetKnockoutStage } from '@/services/tournaments';
import type { KnockoutQualifier } from '@/types';

function nextPow2(n: number): number {
  let s = 2;
  while (s < n) s *= 2;
  return s;
}

/** Builds (or undoes) the knockout after the group stage — PLAN-v2 §9.7. */
export default function KnockoutScreen() {
  const { id, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const m = useTournamentModule(moduleId);
  const [suggested, setSuggested] = useState<KnockoutQualifier[] | null>(null);
  const [order, setOrder] = useState<KnockoutQualifier[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const mod = m.module;
  const built = mod?.current_stage === 2;
  const ready = !!mod && mod.format === 'groups_knockout' && mod.status === 'in_progress' && !built && !!m.counts?.groups_finished;

  useEffect(() => {
    if (!ready || suggested) return;
    let alive = true;
    previewKnockoutQualifiers(moduleId)
      .then((rows) => {
        if (!alive) return;
        const sorted = [...rows].sort((a, b) => a.suggested_seed - b.suggested_seed);
        setSuggested(sorted);
        setOrder(sorted);
      })
      .catch((e) => alive && setLoadError(friendlyTournamentError(e)));
    return () => {
      alive = false;
    };
  }, [ready, suggested, moduleId]);

  if (m.loading) return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />;
  if (!mod || !m.isModuleAdmin) {
    return (
      <View style={styles.denied}>
        <ThemedText variant="heading">No access</ThemedText>
        <ThemedText muted>Only module admins can build the knockout.</ThemedText>
      </View>
    );
  }

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
  };

  const conflicts = sameGroupConflicts(order.map((q) => q.group_letter));
  const conflictLines = conflicts.map(([a, b]) => `${order[a].label} meets ${order[b].label} in round 1`);

  const doBuild = async () => {
    setBusy(true);
    try {
      await buildKnockoutStage(moduleId, order.map((q) => q.entry_id));
      await m.refresh();
      router.replace(`${tournamentRoutes.module(id, moduleId)}?tab=bracket` as never);
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  const onBuild = () =>
    alert('Build the knockout?', 'Group results will be locked until you undo the knockout.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Build', onPress: doBuild },
    ]);

  const onUndo = () =>
    alert('Undo the knockout?', 'The bracket is removed and group results become editable again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo knockout',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await resetKnockoutStage(moduleId);
            setSuggested(null);
            await m.refresh();
          } catch (e) {
            alert('Something went wrong', friendlyTournamentError(e));
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
    >
      {built ? (
        <View style={{ gap: Spacing.md }}>
          <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>Knockout is built</ThemedText>
          <ThemedText muted>
            Group results are locked. Undo the knockout to change them — possible until the first knockout match is decided.
          </ThemedText>
          <Button label="View bracket" onPress={() => router.replace(`${tournamentRoutes.module(id, moduleId)}?tab=bracket` as never)} />
          <Button label="Undo knockout" variant="ghost" onPress={onUndo} loading={busy} buttonStyle={{ borderColor: theme.error }} />
        </View>
      ) : !ready ? (
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>Group stage not finished</ThemedText>
          <ThemedText muted>Decide every group match first, then come back to set the qualifiers.</ThemedText>
        </View>
      ) : loadError ? (
        <ThemedText style={{ color: theme.error }}>{loadError}</ThemedText>
      ) : !suggested ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <>
          <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
            {order.length} qualifiers → {nextPow2(order.length)}-slot bracket
          </ThemedText>
          <ThemedText variant="caption" muted>
            Seed 1 is at the top. Adjacent seeds in the first round meet each other — reorder to avoid group rematches.
          </ThemedText>

          <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {order.map((q, i) => (
              <View key={q.entry_id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
                <View style={[styles.seed, { backgroundColor: theme.backgroundSelected }]}>
                  <ThemedText variant="caption" style={{ fontWeight: '700' }}>{i + 1}</ThemedText>
                </View>
                <View style={[styles.label, { backgroundColor: tint(theme.success) }]}>
                  <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>{q.label}</ThemedText>
                </View>
                <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{q.name}</ThemedText>
                <View style={styles.arrows}>
                  <Pressable onPress={() => move(i, -1)} hitSlop={8} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} accessibilityLabel={`Move ${q.name} up`}>
                    <ArrowUp size={18} color={theme.text} strokeWidth={2} />
                  </Pressable>
                  <Pressable onPress={() => move(i, 1)} hitSlop={8} disabled={i === order.length - 1} style={{ opacity: i === order.length - 1 ? 0.3 : 1 }} accessibilityLabel={`Move ${q.name} down`}>
                    <ArrowDown size={18} color={theme.text} strokeWidth={2} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>

          {conflictLines.map((line) => (
            <View key={line} style={styles.warn}>
              <TriangleAlert size={14} color={theme.warning} strokeWidth={2} />
              <ThemedText variant="caption" style={{ color: theme.warning, flex: 1 }}>{line}</ThemedText>
            </View>
          ))}

          <Button label="Reset to suggested order" variant="ghost" onPress={() => setOrder(suggested)} disabled={busy} />
          <Button label="Build knockout bracket" onPress={onBuild} loading={busy} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  denied: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  seed: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  arrows: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
