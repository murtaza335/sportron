import { Check, ChevronRight, Circle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionLabel } from '@/components/tournaments/form';
import { ProfilePickerSheet } from '@/components/tournaments/ProfilePickerSheet';
import { StatusPill } from '@/components/tournaments/StatusPill';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentModule } from '@/hooks/useTournamentModule';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { entryNoun, moduleStatusTone, startLabel } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { invalidateTournamentsCache } from '@/hooks/useTournaments';
import {
  addModuleAdmin,
  deleteModule,
  removeModuleAdmin,
  setModuleStatus,
} from '@/services/tournaments';
import type { ModuleStatus, ProfileLite } from '@/types';

export default function ModuleManageScreen() {
  const { id, moduleId } = useLocalSearchParams<{ id: string; moduleId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const m = useTournamentModule(moduleId);
  const { isTournamentAdmin } = useTournament(id);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const mod = m.module;
  if (m.loading && !mod) return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />;
  if (!mod || !m.isModuleAdmin) {
    return (
      <View style={styles.denied}>
        <ThemedText variant="heading">No access</ThemedText>
        <ThemedText muted>Only module admins can manage a module.</ThemedText>
      </View>
    );
  }

  const tournamentLocked = m.tournament?.status === 'completed' || m.tournament?.status === 'cancelled';
  const activeEntries = m.entries.filter((e) => e.status === 'active');
  const incompleteRosters =
    mod.participant_type === 'team'
      ? activeEntries.filter((e) => e.member_count < (mod.roster_min ?? 0)).length
      : 0;
  const seedsSet = activeEntries.length > 0 && activeEntries.every((e) => e.seed != null);
  const bracketGenerated = mod.bracket_generated_at != null && (m.counts?.matches ?? 0) > 0;
  const detailsSet = !!mod.name && !!mod.sport;
  const finished = mod.status === 'completed' || mod.status === 'cancelled';

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      invalidateTournamentsCache();
      await m.refresh();
      after?.();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = (status: ModuleStatus) => run(() => setModuleStatus(moduleId, status));

  const primary: { label: string; onPress: () => void; disabled?: boolean } | null =
    tournamentLocked
      ? null
      : mod.status === 'draft'
        ? { label: 'Publish module', onPress: () => changeStatus('open') }
        : mod.status === 'open'
          ? { label: 'Close entries & start seeding', onPress: () => changeStatus('seeding'), disabled: incompleteRosters > 0 }
          : mod.status === 'seeding'
            ? { label: startLabel(mod.format), onPress: () => changeStatus('in_progress'), disabled: !bracketGenerated }
            : null;

  const reopen = () =>
    alert(
      'Reopen entries?',
      'The generated bracket will be deleted. Seeds are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reopen', style: 'destructive', onPress: () => changeStatus('open') },
      ],
    );

  const cancelModule = () =>
    alert('Cancel this module?', 'This stops the module. It can’t be undone from the app.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Cancel module', style: 'destructive', onPress: () => changeStatus('cancelled') },
    ]);

  const del = () =>
    alert('Delete this module?', 'All its entries and matches will be removed.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          run(() => deleteModule(moduleId), () => router.replace(tournamentRoutes.tournament(id))),
      },
    ]);

  const pickAdmin = (p: ProfileLite) => {
    setPickerOpen(false);
    run(() => addModuleAdmin(moduleId, p.id));
  };

  const removeAdmin = (p: ProfileLite) =>
    alert('Remove admin?', `@${p.username} will lose access to this module.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => run(() => removeModuleAdmin(moduleId, p.id)) },
    ]);

  const check = (ok: boolean, label: string) => (
    <View style={styles.checkRow} key={label}>
      {ok ? (
        <Check size={18} color={theme.success} strokeWidth={3} />
      ) : (
        <Circle size={18} color={theme.textSecondary} strokeWidth={2} />
      )}
      <ThemedText style={{ color: ok ? theme.text : theme.textSecondary }}>{label}</ThemedText>
    </View>
  );

  const link = (label: string, right: string | null, onPress: () => void, disabled?: boolean) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.linkRow,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.7 },
      ]}
      accessibilityRole="button"
    >
      <ThemedText style={{ flex: 1, fontWeight: '600' }}>{label}</ThemedText>
      {right && <ThemedText variant="caption" muted>{right}</ThemedText>}
      <ChevronRight size={18} color={theme.textSecondary} />
    </Pressable>
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      refreshControl={<RefreshControl refreshing={m.refreshing} onRefresh={m.refresh} tintColor={theme.text} />}
    >
      <View style={{ gap: Spacing.sm }}>
        <View style={styles.statusRow}>
          <SectionLabel>Status</SectionLabel>
          <StatusPill tone={moduleStatusTone(mod.status)} />
        </View>
        {primary && <Button label={primary.label} onPress={primary.onPress} loading={busy} disabled={primary.disabled} />}
        {mod.status === 'open' && incompleteRosters > 0 && (
          <ThemedText variant="caption" muted>
            Every {entryNoun(mod)} needs at least {mod.roster_min} players before seeding.
          </ThemedText>
        )}
        {mod.status === 'in_progress' && (
          <ThemedText variant="caption" muted>Completes automatically after the final.</ThemedText>
        )}
        {mod.status === 'seeding' && !bracketGenerated && (
          <ThemedText variant="caption" muted>Generate the fixtures from Seeding first.</ThemedText>
        )}
        {mod.status === 'open' && !tournamentLocked && (
          <Button label="Back to draft" variant="ghost" onPress={() => changeStatus('draft')} disabled={busy} />
        )}
        {mod.status === 'seeding' && !tournamentLocked && (
          <Button label="Reopen entries" variant="ghost" onPress={reopen} disabled={busy} />
        )}
      </View>

      <View style={{ gap: Spacing.sm }}>
        <SectionLabel>Checklist</SectionLabel>
        {check(detailsSet, 'Details set')}
        {check(
          activeEntries.length >= 2,
          mod.participant_type === 'team'
            ? `${activeEntries.length} ${activeEntries.length === 1 ? entryNoun(mod) : entryNoun(mod, true)} added${mod.max_entries ? ` (max ${mod.max_entries})` : ''}`
            : `${activeEntries.length} ${activeEntries.length === 1 ? 'entry' : 'entries'} added${mod.max_entries ? ` (max ${mod.max_entries})` : ''}`,
        )}
        {mod.participant_type === 'team' &&
          check(
            incompleteRosters === 0 && activeEntries.length > 0,
            incompleteRosters === 0
              ? `Rosters complete (${activeEntries.length}/${activeEntries.length} ${entryNoun(mod, true)})`
              : `${incompleteRosters} ${incompleteRosters === 1 ? entryNoun(mod) : entryNoun(mod, true)} need more players`,
          )}
        {check(seedsSet, 'Seeds set')}
        {check(bracketGenerated, mod.format === 'single_elimination' || mod.format === 'double_elimination' ? 'Bracket generated' : 'Fixtures generated')}
      </View>

      <View style={{ gap: Spacing.sm }}>
        {link('Edit details', null, () => router.push(tournamentRoutes.moduleForm(id, moduleId)), finished || tournamentLocked)}
        {link('Entries', String(activeEntries.length), () => router.push(`${tournamentRoutes.module(id, moduleId)}?tab=entries` as never))}
        {link('Rounds & schedule', null, () => router.push(tournamentRoutes.rounds(id, moduleId)))}
        {link(mod.format === 'single_elimination' || mod.format === 'double_elimination' ? 'Seeding & bracket' : 'Seeding & fixtures', null, () => router.push(tournamentRoutes.seeding(id, moduleId)))}
      </View>

      <View style={{ gap: Spacing.sm }}>
        <SectionLabel>Module admins</SectionLabel>
        {m.admins.length === 0 && <ThemedText variant="caption" muted>No module admins yet.</ThemedText>}
        {m.admins.map((a) => (
          <View key={a.id} style={styles.adminRow}>
            <UserAvatar avatarUrl={a.avatar_url} size={32} />
            <ThemedText style={{ flex: 1, fontWeight: '600' }}>@{a.username}</ThemedText>
            {isTournamentAdmin && !tournamentLocked && (
              <Pressable onPress={() => removeAdmin(a)} hitSlop={10} accessibilityRole="button">
                <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '700' }}>Remove</ThemedText>
              </Pressable>
            )}
          </View>
        ))}
        {isTournamentAdmin && !tournamentLocked && (
          <Button label="Add admin" variant="secondary" onPress={() => setPickerOpen(true)} disabled={busy} />
        )}
        {!isTournamentAdmin && (
          <ThemedText variant="caption" muted>Only tournament admins can change module admins.</ThemedText>
        )}
      </View>

      {!tournamentLocked && (!finished || isTournamentAdmin) && (
        <View style={{ gap: Spacing.sm }}>
          <SectionLabel>Danger zone</SectionLabel>
          {!finished && (
            <Button label="Cancel module" variant="ghost" onPress={cancelModule} disabled={busy} buttonStyle={{ borderColor: theme.error }} />
          )}
          {isTournamentAdmin && ['draft', 'open', 'cancelled'].includes(mod.status) && (
            <Button label="Delete module" variant="ghost" onPress={del} disabled={busy} buttonStyle={{ borderColor: theme.error }} />
          )}
        </View>
      )}

      <ProfilePickerSheet
        visible={pickerOpen}
        title="Add module admin"
        onClose={() => setPickerOpen(false)}
        onSelect={pickAdmin}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  denied: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.lg },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  adminRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
