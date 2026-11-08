import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { FormField, ModalHeader, NumberStepper, PillSelect, SwitchRow, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { DEFAULT_ROSTER, allowedParticipantTypes } from '@/lib/tournamentFormat';
import {
  createModule,
  fetchModuleDetail,
  updateModule,
  updateModuleSettings,
} from '@/services/tournaments';
import type { ModuleDetail, ModuleSettingsPatch, ParticipantType, SeedingMethod, Sport } from '@/types';
import { isRacketSport, isTeamSport, SPORT_LABELS } from '@/types';

const SPORT_OPTIONS = (Object.keys(SPORT_LABELS) as Sport[]).map((s) => ({ value: s, label: SPORT_LABELS[s] }));

export default function ModuleFormScreen() {
  const { id, moduleId } = useLocalSearchParams<{ id: string; moduleId?: string }>();
  const editing = !!moduleId;
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loaded, setLoaded] = useState<ModuleDetail | null>(null);
  const [loading, setLoading] = useState(editing);

  useEffect(() => {
    if (!moduleId) return;
    let alive = true;
    fetchModuleDetail(moduleId)
      .then((d) => alive && setLoaded(d))
      .catch((e) => alert('Something went wrong', friendlyTournamentError(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [moduleId]);

  const close = () => router.back();

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={['top']}>
      <ModalHeader title={editing ? 'Edit Module' : 'New Module'} onClose={close} />
      {loading ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <ModuleFormBody
          key={loaded?.module.id ?? 'new'}
          tournamentId={id}
          initial={loaded}
          bottomInset={insets.bottom}
          onDone={(newId) => {
            if (editing) router.back();
            else router.replace(tournamentRoutes.moduleManage(id, newId));
          }}
        />
      )}
    </SafeAreaView>
  );
}

function ModuleFormBody({
  tournamentId,
  initial,
  bottomInset,
  onDone,
}: {
  tournamentId: string;
  initial: ModuleDetail | null;
  bottomInset: number;
  onDone: (moduleId: string) => void;
}) {
  const m = initial?.module ?? null;
  const [name, setName] = useState(m?.name ?? '');
  const [sport, setSport] = useState<Sport>(m?.sport ?? 'table_tennis');
  const [venue, setVenue] = useState(m?.venue ?? '');
  const [startsAt, setStartsAt] = useState<Date | null>(m?.starts_at ? new Date(m.starts_at) : null);
  const [maxEntries, setMaxEntries] = useState(m?.max_entries != null ? String(m.max_entries) : '');
  const [description, setDescription] = useState(m?.description ?? '');
  const [rules, setRules] = useState(m?.rules_text ?? '');
  const [third, setThird] = useState(m?.third_place_match ?? false);
  const [seeding, setSeeding] = useState<SeedingMethod>(m?.seeding_method ?? 'manual');
  const [participantType, setParticipantType] = useState<ParticipantType>(
    m?.participant_type ?? (isTeamSport(m?.sport ?? 'table_tennis') ? 'team' : 'individual'),
  );
  const [rosterMin, setRosterMin] = useState(m?.roster_min ?? DEFAULT_ROSTER[m?.sport ?? 'table_tennis'].min);
  const [rosterMax, setRosterMax] = useState(m?.roster_max ?? DEFAULT_ROSTER[m?.sport ?? 'table_tennis'].max);
  const [lineup, setLineup] = useState<number | null>(
    m ? m.lineup_size : DEFAULT_ROSTER.table_tennis.lineup,
  );
  // If the first save created the module but the settings call failed, later saves edit it.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBracket = !!m && (m.bracket_generated_at != null || (initial?.counts.matches ?? 0) > 0);
  const sportLocked = !!m && (hasBracket || (m.status !== 'draft' && m.status !== 'open'));
  const settingsLocked = !!m && (hasBracket || ['in_progress', 'completed', 'cancelled'].includes(m.status));
  const playersLocked =
    !!m && ((initial?.counts.entries ?? 0) + (initial?.counts.withdrawn ?? 0) > 0 || !['draft', 'open'].includes(m.status));
  const allowedTypes = allowedParticipantTypes(sport);
  const doubles = participantType === 'team' && isRacketSport(sport);

  /** Changing the sport re-applies the player defaults (only while they are still editable). */
  const onSportChange = (next: Sport) => {
    setSport(next);
    if (playersLocked) return;
    const allowed = allowedParticipantTypes(next);
    const type: ParticipantType = isTeamSport(next)
      ? 'team'
      : allowed.includes(participantType)
        ? participantType
        : allowed[0];
    setParticipantType(type);
    const d = DEFAULT_ROSTER[next];
    setRosterMin(d.min);
    setRosterMax(d.max);
    setLineup(d.lineup);
  };

  const maxN = maxEntries.trim() === '' ? null : parseInt(maxEntries, 10);
  const maxInvalid = maxN !== null && (Number.isNaN(maxN) || maxN < 2 || maxN > 128);
  const canSave = name.trim().length >= 2 && !maxInvalid && !saving;

  const submit = async () => {
    if (!canSave) {
      setError(name.trim().length < 2 ? 'Name must be at least 2 characters.' : 'Max entries must be 2–128.');
      return;
    }
    setSaving(true);
    setError(null);
    const input = {
      name: name.trim(),
      sport,
      description: description.trim() || null,
      rules_text: rules.trim() || null,
      venue: venue.trim() || null,
      starts_at: startsAt ? startsAt.toISOString() : null,
      max_entries: maxN,
      third_place_match: third,
      seeding_method: seeding,
    };
    const targetId = m?.id ?? createdId;
    try {
      let id: string;
      if (targetId) {
        await updateModule(targetId, input);
        id = targetId;
      } else {
        id = await createModule(tournamentId, input);
        setCreatedId(id);
      }
      // v2 player settings. Skipped when nothing differs from what the module already has.
      const wanted: ModuleSettingsPatch =
        participantType === 'team'
          ? { participant_type: 'team', roster_min: rosterMin, roster_max: rosterMax, lineup_size: lineup }
          : { participant_type: 'individual' };
      const current = m;
      const changed =
        !current ||
        current.participant_type !== wanted.participant_type ||
        (wanted.participant_type === 'team' &&
          (current.roster_min !== rosterMin || current.roster_max !== rosterMax || current.lineup_size !== lineup));
      if (changed && !playersLocked) await updateModuleSettings(id, wanted);
      onDone(id);
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoider style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset + Spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <FormField label="Name *" error={error && name.trim().length < 2 ? error : null}>
          <TextField value={name} onChangeText={setName} placeholder="e.g. Table Tennis — Men's Singles" maxLength={60} autoFocus={!m} />
        </FormField>

        <FormField label="Sport *" hint={sportLocked ? 'Sport can’t be changed once the bracket exists.' : undefined}>
          <PillSelect options={SPORT_OPTIONS} value={sport} onChange={onSportChange} disabled={sportLocked} />
        </FormField>

        <FormField
          label="Players *"
          hint={playersLocked ? 'Can’t change after entries are added.' : undefined}
        >
          {isTeamSport(sport) ? (
            <ThemedText variant="body" style={{ fontWeight: '600', marginLeft: Spacing.xs }}>Teams</ThemedText>
          ) : (
            <PillSelect
              options={
                isRacketSport(sport)
                  ? [
                      { value: 'individual' as ParticipantType, label: 'Singles' },
                      { value: 'team' as ParticipantType, label: 'Doubles' },
                    ]
                  : [
                      { value: 'individual' as ParticipantType, label: 'Individual' },
                      { value: 'team' as ParticipantType, label: 'Teams' },
                    ]
              }
              value={participantType}
              onChange={(t) => {
                setParticipantType(t);
                if (t === 'team') {
                  const d = DEFAULT_ROSTER[sport];
                  setRosterMin(d.min);
                  setRosterMax(d.max);
                  setLineup(d.lineup);
                }
              }}
              disabled={playersLocked || allowedTypes.length < 2}
            />
          )}
        </FormField>

        {participantType === 'team' && !doubles && (
          <View style={{ gap: Spacing.md }}>
            <View style={styles.rosterRow}>
              <View style={{ gap: Spacing.xs }}>
                <ThemedText variant="label" muted style={{ marginLeft: Spacing.xs }}>MIN PLAYERS</ThemedText>
                <NumberStepper
                  label="Minimum players"
                  value={rosterMin}
                  min={1}
                  max={40}
                  onChange={(n) => {
                    setRosterMin(n);
                    if (rosterMax < n) setRosterMax(n);
                  }}
                />
              </View>
              <View style={{ gap: Spacing.xs }}>
                <ThemedText variant="label" muted style={{ marginLeft: Spacing.xs }}>MAX PLAYERS</ThemedText>
                <NumberStepper
                  label="Maximum players"
                  value={rosterMax}
                  min={1}
                  max={40}
                  onChange={(n) => {
                    setRosterMax(n);
                    if (rosterMin > n) setRosterMin(n);
                  }}
                />
              </View>
              <View style={{ gap: Spacing.xs }}>
                <ThemedText variant="label" muted style={{ marginLeft: Spacing.xs }}>ON FIELD</ThemedText>
                <NumberStepper
                  label="Players on field"
                  value={lineup ?? rosterMin}
                  min={1}
                  max={40}
                  onChange={setLineup}
                />
              </View>
            </View>
            <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs }}>
              Each team needs {rosterMin === rosterMax ? rosterMin : `${rosterMin}–${rosterMax}`} players before seeding.
            </ThemedText>
          </View>
        )}
        {doubles && (
          <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs }}>
            Each pair is a team of exactly 2 players.
          </ThemedText>
        )}

        <FormField label="Venue">
          <TextField value={venue} onChangeText={setVenue} placeholder="e.g. Main Hall" maxLength={120} />
        </FormField>

        <FormField label="Starts">
          <DateTimeField value={startsAt} onChange={setStartsAt} />
        </FormField>

        <FormField label="Max entries" error={maxInvalid ? 'Enter a number from 2 to 128.' : null}>
          <TextField value={maxEntries} onChangeText={(v) => setMaxEntries(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="No limit" maxLength={3} />
        </FormField>

        <FormField label="Description">
          <TextField value={description} onChangeText={setDescription} multiline maxLength={1000} placeholder="What is this event about?" />
        </FormField>

        <FormField label="Rules">
          <TextField value={rules} onChangeText={setRules} multiline maxLength={2000} placeholder="Match rules, tie-breaks, dress code…" />
        </FormField>

        <View style={{ gap: Spacing.md }}>
          <SwitchRow
            label="3rd-place match"
            hint={settingsLocked ? 'Locked once the bracket is generated.' : 'Adds a match between the semi-final losers.'}
            value={third}
            onChange={setThird}
            disabled={settingsLocked}
          />
          <FormField label="Seeding">
            <PillSelect
              options={[
                { value: 'manual' as SeedingMethod, label: 'Manual' },
                { value: 'random' as SeedingMethod, label: 'Random' },
              ]}
              value={seeding}
              onChange={setSeeding}
              disabled={!!m && ['in_progress', 'completed', 'cancelled'].includes(m.status)}
            />
            <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs }}>
              Random shuffles entries you haven’t seeded when the bracket is generated.
            </ThemedText>
          </FormField>
        </View>

        <Button label={m ? 'Save changes' : 'Create module'} onPress={submit} loading={saving} disabled={!canSave} />
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rosterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  container: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md },
});
