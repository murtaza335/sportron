import { MapPin, Settings, Trophy } from 'lucide-react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BracketView } from '@/components/tournaments/BracketView';
import { EntrySheet } from '@/components/tournaments/EntrySheet';
import { ModuleEntriesTab } from '@/components/tournaments/ModuleEntriesTab';
import { ModuleInfoTab } from '@/components/tournaments/ModuleInfoTab';
import { InfoPill, StatusPill } from '@/components/tournaments/StatusPill';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentFields } from '@/hooks/useTournamentFields';
import { useTournamentModule } from '@/hooks/useTournamentModule';
import { formatMatchTime, moduleStatusTone, sportLabel } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { TournamentEntry } from '@/types';

type Tab = 'bracket' | 'standings' | 'matches' | 'entries' | 'info';

const TABS: { value: Tab; label: string }[] = [
  { value: 'bracket', label: 'Bracket' },
  { value: 'standings', label: 'Standings' },
  { value: 'matches', label: 'Matches' },
  { value: 'entries', label: 'Entries' },
  { value: 'info', label: 'Info' },
];

export default function ModuleScreen() {
  const { id, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = useTournamentModule(moduleId);
  const { fields } = useTournamentFields(id);

  const [tab, setTab] = useState<Tab>('entries');
  const [selected, setSelected] = useState<TournamentEntry | null>(null);
  const defaulted = useRef(false);

  // Default tab: Bracket if a bracket exists, else Entries (once, after first load).
  useEffect(() => {
    if (m.loading || defaulted.current || !m.module) return;
    defaulted.current = true;
    setTab(m.bracket.length > 0 ? 'bracket' : 'entries');
  }, [m.loading, m.module, m.bracket.length]);

  const mod = m.module;
  const champion = mod?.champion_entry_id ? m.entries.find((e) => e.id === mod.champion_entry_id) : null;
  const canAddEntries = m.isModuleAdmin && (mod?.status === 'draft' || mod?.status === 'open');
  const tabsWidth = Math.max(width - Spacing.md * 2, 440);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: mod?.name ?? 'Module',
          headerRight: () =>
            m.isModuleAdmin ? (
              <Pressable
                onPress={() => router.push(tournamentRoutes.moduleManage(id, moduleId))}
                hitSlop={12}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
                accessibilityRole="button"
                accessibilityLabel="Manage module"
              >
                <Settings size={22} color={theme.text} strokeWidth={2} />
              </Pressable>
            ) : null,
        }}
      />
      {m.loading && !mod ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : !mod ? (
        <View style={styles.empty}>
          <Trophy size={48} color={theme.textSecondary} strokeWidth={1.5} />
          <ThemedText variant="heading">Module not found</ThemedText>
          <ThemedText muted>It may be private or no longer available.</ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={m.refreshing} onRefresh={m.refresh} tintColor={theme.text} />}
        >
          <View style={styles.header}>
            <View style={styles.pills}>
              <InfoPill label={sportLabel(mod.sport)} />
              <StatusPill tone={moduleStatusTone(mod.status)} />
            </View>
            <ThemedText variant="caption" muted>
              {m.counts?.entries ?? 0} entries · Single elimination
            </ThemedText>
            {(mod.venue || mod.starts_at) && (
              <View style={styles.meta}>
                <MapPin size={13} color={theme.textSecondary} strokeWidth={2} />
                <ThemedText variant="caption" muted>
                  {[mod.venue, formatMatchTime(mod.starts_at)].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
            )}
            {mod.status === 'completed' && champion && (
              <View style={[styles.champion, { backgroundColor: `${theme.warning}26` }]}>
                <Trophy size={16} color={theme.warning} strokeWidth={2} />
                <ThemedText style={{ fontWeight: '700' }}>Champion: {champion.name}</ThemedText>
              </View>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: tabsWidth }}>
              <SegmentedControl options={TABS} value={tab} onChange={setTab} compact />
            </View>
          </ScrollView>

          {tab === 'entries' && (
            <ModuleEntriesTab
              entries={m.entries}
              fields={fields}
              canAdd={!!canAddEntries}
              onAdd={() => router.push(tournamentRoutes.entryForm(id, moduleId))}
              onSelect={setSelected}
            />
          )}
          {tab === 'info' && <ModuleInfoTab module={mod} rounds={m.rounds} admins={m.admins} />}
          {tab === 'bracket' && (
            <BracketView
              matches={m.bracket}
              moduleStatus={mod.status}
              viewerId={user?.id}
              isAdmin={m.isModuleAdmin}
              onSelectMatch={() => {}}
            />
          )}
          {(tab === 'standings' || tab === 'matches') && (
            <View style={styles.empty}>
              <ThemedText muted>Coming soon</ThemedText>
            </View>
          )}
        </ScrollView>
      )}

      <EntrySheet
        entry={selected}
        fields={fields}
        bracket={m.bracket}
        isAdmin={m.isModuleAdmin}
        onClose={() => setSelected(null)}
        onOpenProfile={(pid) => {
          setSelected(null);
          router.push(tournamentRoutes.profile(pid));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: { marginTop: Spacing.xxl },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  header: { gap: Spacing.sm },
  pills: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  champion: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.md },
});
