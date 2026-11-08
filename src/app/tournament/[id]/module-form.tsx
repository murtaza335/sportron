import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { FormField, ModalHeader, PillSelect, SwitchRow, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { createModule, fetchModuleDetail, updateModule } from '@/services/tournaments';
import type { ModuleDetail, SeedingMethod, Sport } from '@/types';
import { SPORT_LABELS } from '@/types';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasBracket = !!m && (m.bracket_generated_at != null || (initial?.counts.matches ?? 0) > 0);
  const sportLocked = !!m && (hasBracket || (m.status !== 'draft' && m.status !== 'open'));
  const settingsLocked = !!m && (hasBracket || ['in_progress', 'completed', 'cancelled'].includes(m.status));
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
    try {
      if (m) {
        await updateModule(m.id, input);
        onDone(m.id);
      } else {
        onDone(await createModule(tournamentId, input));
      }
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
          <PillSelect options={SPORT_OPTIONS} value={sport} onChange={setSport} disabled={sportLocked} />
        </FormField>

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
  container: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md },
});
