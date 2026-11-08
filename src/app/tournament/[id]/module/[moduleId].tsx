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
import { ResultEntrySheet } from '@/components/tournaments/ResultEntrySheet';
import { ScheduleSheet } from '@/components/tournaments/ScheduleSheet';
import { EntrySheet } from '@/components/tournaments/EntrySheet';
import { ModuleEntriesTab } from '@/components/tournaments/ModuleEntriesTab';
import { ModuleStandingsTab } from '@/components/tournaments/ModuleStandingsTab';
import { ModuleMatchesTab } from '@/components/tournaments/ModuleMatchesTab';
import { TournamentMatchSheet } from '@/components/tournaments/TournamentMatchSheet';
import { ModuleInfoTab } from '@/components/tournaments/ModuleInfoTab';
import { InfoPill, StatusPill } from '@/components/tournaments/StatusPill';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentFields } from '@/hooks/useTournamentFields';
import { useTournamentModule } from '@/hooks/useTournamentModule';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { deleteEntry, resetMatch, withdrawEntry } from '@/services/tournaments';
import { Button } from '@/components/ui/Button';
import { entryNoun, formatMatchTime, moduleStatusTone, participantLabel, sportLabel } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { TournamentEntry, TournamentMatch } from '@/types';

type Tab = 'bracket' | 'standings' | 'matches' | 'entries' | 'info';

const TABS: { value: Tab; label: string }[] = [
  { value: 'bracket', label: 'Bracket' },
  { value: 'standings', label: 'Standings' },
  { value: 'matches', label: 'Matches' },
  { value: 'entries', label: 'Entries' },
  { value: 'info', label: 'Info' },
];

export default function ModuleScreen() {
  const { id, moduleId, tab: tabParam } = useLocalSearchParams<{ id: string; moduleId: string; tab?: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const m = useTournamentModule(moduleId);
  const { fields } = useTournamentFields(id);

  const [tab, setTab] = useState<Tab>('entries');
  const [selected, setSelected] = useState<TournamentEntry | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [resultMatchId, setResultMatchId] = useState<string | null>(null);
  const [scheduleMatchId, setScheduleMatchId] = useState<string | null>(null);
  const defaulted = useRef(false);

  // Default tab: Bracket if a bracket exists, else Entries (once, after first load).
  useEffect(() => {
    if (m.loading || defaulted.current || !m.module) return;
    defaulted.current = true;
    const requested = TABS.find((t) => t.value === tabParam)?.value;
    setTab(requested ?? (m.bracket.length > 0 ? 'bracket' : 'entries'));
  }, [m.loading, m.module, m.bracket.length, tabParam]);

  const mod = m.module;
  // Entries the viewer plays in — their own entry or a team they are a member of.
  const ownEntryIds = new Set<string>();
  if (user?.id) {
    for (const e of m.entries) {
      if (e.profile?.id === user.id || e.members.some((x) => x.profile?.id === user.id)) ownEntryIds.add(e.id);
    }
  }

  const matchActions = (match: TournamentMatch) => {
    if (!m.isModuleAdmin || !mod) return null;
    const decided = match.status === 'completed' || match.status === 'walkover';
    const bothPresent = !!match.entry_a && !!match.entry_b;
    const live = mod.status === 'in_progress';
    const canResult = live && bothPresent && match.status !== 'bye' && match.status !== 'cancelled';
    const canSchedule =
      (mod.status === 'seeding' || live) && (match.status === 'pending' || match.status === 'scheduled');
    const canReset = live && decided;
    if (!canResult && !canSchedule && !canReset) return null;
    const doReset = () =>
      alert('Reset this result?', 'The winner will be removed from the next match.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetMatch(match.id);
              setSelectedMatchId(null);
              await m.refresh();
            } catch (e) {
              alert('Something went wrong', friendlyTournamentError(e));
            }
          },
        },
      ]);
    return (
      <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
        {canResult && (
          <Button
            label={decided ? 'Edit result' : 'Enter result'}
            onPress={() => {
              setSelectedMatchId(null);
              setResultMatchId(match.id);
            }}
          />
        )}
        {canSchedule && (
          <Button
            label="Schedule"
            variant="secondary"
            onPress={() => {
              setSelectedMatchId(null);
              setScheduleMatchId(match.id);
            }}
          />
        )}
        {canReset && <Button label="Reset" variant="ghost" onPress={doReset} buttonStyle={{ borderColor: theme.error }} />}
      </View>
    );
  };

  const entryActions = (entry: TournamentEntry) => {
    const status = mod?.status;
    const canEdit = status === 'draft' || status === 'open';
    const canWithdraw = entry.status === 'active' && (status === 'open' || status === 'in_progress');
    const canDelete = status === 'draft' || status === 'open';
    const doWithdraw = () =>
      alert('Withdraw entry?', `${entry.name} will be marked as withdrawn.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Withdraw',
          style: 'destructive',
          onPress: async () => {
            try {
              await withdrawEntry(entry.id);
              setSelected(null);
              await m.refresh();
              if (status === 'in_progress') {
                alert('Entry withdrawn', 'Record a walkover for their pending match from the Matches tab.');
              }
            } catch (e) {
              alert('Something went wrong', friendlyTournamentError(e));
            }
          },
        },
      ]);
    const doDelete = () =>
      alert('Delete entry?', `${entry.name} will be removed permanently.`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEntry(entry.id);
              setSelected(null);
              await m.refresh();
            } catch (e) {
              alert('Something went wrong', friendlyTournamentError(e));
            }
          },
        },
      ]);
    if (!m.isModuleAdmin || (!canEdit && !canWithdraw && !canDelete)) return null;
    return (
      <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
        {canEdit && entry.status === 'active' && (
          <Button
            label="Edit"
            variant="secondary"
            onPress={() => {
              setSelected(null);
              router.push(tournamentRoutes.entryForm(id, moduleId, entry.id));
            }}
          />
        )}
        {canWithdraw && <Button label="Withdraw" variant="ghost" onPress={doWithdraw} />}
        {canDelete && (
          <Button label="Delete" variant="ghost" onPress={doDelete} buttonStyle={{ borderColor: theme.error }} />
        )}
      </View>
    );
  };
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
              {m.counts?.entries ?? 0} {mod.participant_type === 'team' ? entryNoun(mod, true) : 'entries'} · {participantLabel(mod)} · Single elimination
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
              module={mod}
              isAdmin={m.isModuleAdmin}
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
              onSelectMatch={(match: TournamentMatch) => setSelectedMatchId(match.id)}
            />
          )}
          {tab === 'standings' && (
            <ModuleStandingsTab
              standings={m.standings}
              rounds={m.rounds}
              viewerId={user?.id}
              ownEntryIds={ownEntryIds}
              onSelectEntry={(entryId) => {
                const e = m.entries.find((x) => x.id === entryId);
                if (e) setSelected(e);
              }}
            />
          )}
          {tab === 'matches' && (
            <ModuleMatchesTab matches={m.bracket} onSelect={(match) => setSelectedMatchId(match.id)} />
          )}
        </ScrollView>
      )}

      <TournamentMatchSheet
        match={m.bracket.find((x) => x.id === selectedMatchId) ?? null}
        allMatches={m.bracket}
        onClose={() => setSelectedMatchId(null)}
        footer={(() => {
          const sel = m.bracket.find((x) => x.id === selectedMatchId);
          return sel ? matchActions(sel) : null;
        })()}
      />
      <ResultEntrySheet
        match={m.bracket.find((x) => x.id === resultMatchId) ?? null}
        sport={mod?.sport ?? 'other'}
        onClose={() => setResultMatchId(null)}
        onSaved={m.refresh}
      />
      <ScheduleSheet
        match={m.bracket.find((x) => x.id === scheduleMatchId) ?? null}
        onClose={() => setScheduleMatchId(null)}
        onSaved={m.refresh}
      />
      <EntrySheet
        module={mod}
        entry={selected}
        fields={fields}
        bracket={m.bracket}
        isAdmin={m.isModuleAdmin}
        onClose={() => setSelected(null)}
        footer={selected ? entryActions(selected) : null}
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
