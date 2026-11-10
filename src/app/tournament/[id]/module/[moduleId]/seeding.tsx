import { ArrowDown, ArrowUp, Shuffle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { haptics } from '@/lib/haptics';
import { LayoutShift } from '@/lib/motion';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { PillSelect } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentModule } from '@/hooks/useTournamentModule';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { generateLabel, previewTab, structureSummary } from '@/lib/tournamentFormat';
import { generateBracket, moveGroupEntry, setModuleSeeds } from '@/services/tournaments';

type Item = { id: string; name: string; seeded: boolean };

export default function SeedingScreen() {
  const { id, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const m = useTournamentModule(moduleId);
  const [order, setOrder] = useState<Item[] | null>(null);
  const [dirty, setDirty] = useState(false);
  const [moving, setMoving] = useState<{ entryId: string; name: string; groupId: string } | null>(null);
  const [busy, setBusy] = useState<'save' | 'generate' | null>(null);
  const initialised = useRef(false);

  const mod = m.module;

  // Initialise the editable order once from the loaded entries (seeded first, by seed).
  useEffect(() => {
    if (initialised.current || m.loading) return;
    initialised.current = true;
    const active = m.entries.filter((e) => e.status === 'active');
    const sorted = [...active].sort((a, b) => {
      if (a.seed != null && b.seed != null) return a.seed - b.seed;
      if (a.seed != null) return -1;
      if (b.seed != null) return 1;
      return a.name.localeCompare(b.name);
    });
    setOrder(sorted.map((e) => ({ id: e.id, name: e.name, seeded: e.seed != null })));
  }, [m.loading, m.entries]);

  if (m.loading || !order) return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />;
  if (!mod || !m.isModuleAdmin) {
    return (
      <View style={styles.denied}>
        <ThemedText variant="heading">No access</ThemedText>
        <ThemedText muted>Only module admins can manage seeding.</ThemedText>
      </View>
    );
  }

  const n = order.length;
  const summary = structureSummary(mod, n);
  const editable = mod.status === 'open' || mod.status === 'seeding';
  const canGenerate = mod.status === 'seeding' && n >= 2;
  const hasBracket = (m.counts?.matches ?? 0) > 0;
  const unseeded = order.filter((o) => !o.seeded);

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[idx], next[j]] = [next[j], next[idx]];
    setOrder(next);
    setDirty(true);
    haptics.selection();
  };

  const shuffleUnseeded = () => {
    const seeded = order.filter((o) => o.seeded);
    const rest = [...unseeded];
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    setOrder([...seeded, ...rest]);
    setDirty(true);
  };

  const saveSeeds = async (): Promise<boolean> => {
    try {
      await setModuleSeeds(moduleId, order.map((o) => o.id));
      setOrder(order.map((o) => ({ ...o, seeded: true })));
      setDirty(false);
      return true;
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
      return false;
    }
  };

  const onSave = async () => {
    setBusy('save');
    if (await saveSeeds()) await m.refresh();
    setBusy(null);
  };

  const doGenerate = async () => {
    setBusy('generate');
    try {
      if (dirty || order.some((o) => !o.seeded)) {
        if (!(await saveSeeds())) return;
      }
      const count = await generateBracket(moduleId);
      await m.refresh();
      alert(mod?.format === 'single_elimination' ? 'Bracket generated' : 'Fixtures generated', `${count} matches created.`, [
        { text: 'Later', style: 'cancel' },
        { text: 'Preview', onPress: () => router.replace(`${tournamentRoutes.module(id, moduleId)}?tab=${previewTab(mod!.format)}` as never) },
      ]);
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(null);
    }
  };

  const doMove = async (groupId: string) => {
    if (!moving) return;
    setBusy('save');
    try {
      await moveGroupEntry(moving.entryId, groupId);
      setMoving(null);
      await m.refresh();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(null);
    }
  };

  const onGenerate = () => {
    if (hasBracket) {
      alert('Regenerate?', 'The current fixtures and any results will be replaced.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Regenerate', style: 'destructive', onPress: doGenerate },
      ]);
    } else {
      doGenerate();
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
    >
      <View style={{ gap: 2 }}>
        <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
          {summary.title}
        </ThemedText>
        {summary.detail && <ThemedText variant="caption" muted>{summary.detail}</ThemedText>}
        {mod.seeding_method === 'random' && (
          <ThemedText variant="caption" muted>Random seeding: unseeded entries are shuffled when you generate.</ThemedText>
        )}
        {!editable && (
          <ThemedText variant="caption" style={{ color: theme.warning }}>
            Seeds can only be changed while the module is Open or in Seeding.
          </ThemedText>
        )}
        {mod.status === 'open' && (
          <ThemedText variant="caption" muted>Close entries & start seeding from Manage to generate the fixtures.</ThemedText>
        )}
      </View>

      {editable && unseeded.length > 0 && (
        <Button
          label="Shuffle unseeded"
          variant="secondary"
          icon={<Shuffle size={18} color={theme.text} />}
          onPress={shuffleUnseeded}
          disabled={!!busy}
        />
      )}

      <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {order.map((o, i) => (
          <Animated.View key={o.id} layout={LayoutShift} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }]}>
            <View style={[styles.seed, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText variant="caption" style={{ fontWeight: '700' }}>{i + 1}</ThemedText>
            </View>
            <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{o.name}</ThemedText>
            {!o.seeded && <ThemedText variant="caption" muted style={{ fontSize: 10 }}>UNSEEDED</ThemedText>}
            {editable && (
              <View style={styles.arrows}>
                <Pressable onPress={() => move(i, -1)} hitSlop={8} disabled={i === 0} style={{ opacity: i === 0 ? 0.3 : 1 }} accessibilityLabel={`Move ${o.name} up`}>
                  <ArrowUp size={18} color={theme.text} strokeWidth={2} />
                </Pressable>
                <Pressable onPress={() => move(i, 1)} hitSlop={8} disabled={i === n - 1} style={{ opacity: i === n - 1 ? 0.3 : 1 }} accessibilityLabel={`Move ${o.name} down`}>
                  <ArrowDown size={18} color={theme.text} strokeWidth={2} />
                </Pressable>
              </View>
            )}
          </Animated.View>
        ))}
      </View>

      {mod.format === 'groups_knockout' && m.groups.length > 0 && (
        <View style={{ gap: Spacing.sm }}>
          <ThemedText variant="label" muted>GROUPS</ThemedText>
          {m.groups.map((g) => (
            <View key={g.id} style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <View style={[styles.row, { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                <ThemedText style={{ flex: 1, fontWeight: '700' }}>{g.name}</ThemedText>
                <ThemedText variant="caption" muted>{g.entries.length} entries</ThemedText>
              </View>
              {g.entries.map((en, i) => (
                <Pressable
                  key={en.entry_id}
                  disabled={mod.status !== 'seeding'}
                  onPress={() => setMoving({ entryId: en.entry_id, name: en.name, groupId: g.id })}
                  style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: theme.border }, pressed && { opacity: 0.6 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${en.name} to another group`}
                >
                  <View style={[styles.seed, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText variant="caption" style={{ fontWeight: '700' }}>{en.seed ?? '–'}</ThemedText>
                  </View>
                  <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{en.name}</ThemedText>
                  {mod.status === 'seeding' && <ThemedText variant="caption" muted>Move</ThemedText>}
                </Pressable>
              ))}
            </View>
          ))}
          <ThemedText variant="caption" muted>
            Tap an entry to move it to another group. Fixtures are rebuilt. Each group keeps 2–8 entries.
          </ThemedText>
        </View>
      )}

      {editable && (
        <Button label="Save seeds" variant="secondary" onPress={onSave} loading={busy === 'save'} disabled={!!busy || !dirty} />
      )}
      {mod.status === 'seeding' && (
        <Button
          label={generateLabel(mod.format, hasBracket)}
          onPress={onGenerate}
          loading={busy === 'generate'}
          disabled={!!busy || !canGenerate}
        />
      )}
      {hasBracket && (
        <Button
          label={mod.format === 'single_elimination' || mod.format === 'double_elimination' ? 'Preview bracket' : 'Preview fixtures'}
          variant="ghost"
          onPress={() => router.push(`${tournamentRoutes.module(id, moduleId)}?tab=${previewTab(mod.format)}` as never)}
        />
      )}
      <BottomSheet visible={!!moving} onClose={() => setMoving(null)}>
        {moving && (
          <View style={{ gap: Spacing.md, paddingBottom: Spacing.md }}>
            <ThemedText variant="heading">Move {moving.name}</ThemedText>
            <ThemedText variant="caption" muted>Pick the group to move them to.</ThemedText>
            <PillSelect
              options={m.groups.filter((g) => g.id !== moving.groupId).map((g) => ({ value: g.id, label: g.name }))}
              value={null}
              onChange={doMove}
              disabled={busy !== null}
            />
          </View>
        )}
      </BottomSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  denied: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  seed: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  arrows: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
});
