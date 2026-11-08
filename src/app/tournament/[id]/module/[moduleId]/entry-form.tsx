import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryFieldControl } from '@/components/tournaments/EntryFieldControl';
import { FormField, ModalHeader, TextField } from '@/components/tournaments/form';
import { ProfilePickerSheet } from '@/components/tournaments/ProfilePickerSheet';
import { TeamEntryForm } from '@/components/tournaments/TeamEntryForm';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournamentFields } from '@/hooks/useTournamentFields';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { validateFieldValue } from '@/lib/tournamentFormat';
import { fetchModuleDetail, fetchModuleEntries, upsertEntry } from '@/services/tournaments';
import type { ProfileLite, TournamentEntry, TournamentEntryField, TournamentModule } from '@/types';

export default function EntryFormScreen() {
  const { id, moduleId, entryId } = useLocalSearchParams<{ id: string; moduleId: string; entryId?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { fields, loading: fLoading } = useTournamentFields(id);
  const [entry, setEntry] = useState<TournamentEntry | null>(null);
  const [eLoading, setELoading] = useState(!!entryId);
  const [module, setModule] = useState<TournamentModule | null>(null);

  useEffect(() => {
    let alive = true;
    fetchModuleDetail(moduleId)
      .then((d) => alive && setModule(d.module))
      .catch((e) => alert('Something went wrong', friendlyTournamentError(e)));
    return () => {
      alive = false;
    };
  }, [moduleId]);

  useEffect(() => {
    if (!entryId) return;
    let alive = true;
    fetchModuleEntries(moduleId)
      .then((list) => alive && setEntry(list.find((e) => e.id === entryId) ?? null))
      .catch((e) => alert('Something went wrong', friendlyTournamentError(e)))
      .finally(() => alive && setELoading(false));
    return () => {
      alive = false;
    };
  }, [moduleId, entryId]);

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]} edges={['top']}>
      <ModalHeader
        title={
          module?.participant_type === 'team'
            ? entryId ? 'Edit Team' : 'Add Team'
            : entryId ? 'Edit Entry' : 'Add Entry'
        }
        onClose={() => router.back()}
      />
      {fLoading || eLoading || !module ? (
        <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />
      ) : module.participant_type === 'team' ? (
        <TeamEntryForm
          key={entry?.id ?? 'new'}
          module={module}
          fields={fields}
          entry={entry}
          bottomInset={insets.bottom}
          onClose={() => router.back()}
        />
      ) : (
        <EntryFormBody
          key={entry?.id ?? 'new'}
          moduleId={moduleId}
          fields={fields}
          entry={entry}
          bottomInset={insets.bottom}
          onClose={() => router.back()}
        />
      )}
    </SafeAreaView>
  );
}

function EntryFormBody({
  moduleId,
  fields,
  entry,
  bottomInset,
  onClose,
}: {
  moduleId: string;
  fields: TournamentEntryField[];
  entry: TournamentEntry | null;
  bottomInset: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const nameField = fields.find((f) => f.key === 'name');
  const others = fields.filter((f) => f.key !== 'name');
  const labels = Object.fromEntries(fields.map((f) => [f.key, f.label]));
  const scrollRef = useRef<ScrollView>(null);

  const [name, setName] = useState(entry?.name ?? '');
  const [values, setValues] = useState<Record<string, string>>(entry?.fields ?? {});
  const [profile, setProfile] = useState<ProfileLite | null>(entry?.profile ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'save' | 'another' | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const setValue = (key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = `${nameField?.label ?? 'Name'} is required.`;
    for (const f of others) {
      const err = validateFieldValue(f, values[f.key] ?? '');
      if (err) next[f.key] = err;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (another: boolean) => {
    if (!validate()) return;
    setSaving(another ? 'another' : 'save');
    try {
      const clean: Record<string, string> = {};
      for (const f of others) {
        const v = (values[f.key] ?? '').trim();
        if (v) clean[f.key] = v;
      }
      await upsertEntry(moduleId, entry?.id ?? null, name.trim(), profile?.id ?? null, clean);
      if (another) {
        setName('');
        setValues({});
        setProfile(null);
        setErrors({});
        setResetKey((k) => k + 1);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        onClose();
      }
    } catch (e) {
      const msg = friendlyTournamentError(e, labels);
      const raw = e instanceof Error ? e.message : '';
      const m = raw.match(/FIELD_(?:REQUIRED|INVALID):([a-z0-9_]+)/);
      if (m) setErrors((prev) => ({ ...prev, [m[1]]: msg }));
      else if (raw.includes('DUPLICATE_CMS_ID')) setErrors((prev) => ({ ...prev, cms_id: msg }));
      else alert('Something went wrong', msg);
    } finally {
      setSaving(null);
    }
  };

  return (
    <KeyboardAvoider style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset + Spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View key={resetKey} style={{ gap: Spacing.md }}>
          <FormField label={`${nameField?.label ?? 'Name'} *`} error={errors.name}>
            <TextField
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (errors.name) setErrors((p) => ({ ...p, name: '' }));
              }}
              placeholder={nameField?.placeholder ?? undefined}
              maxLength={60}
              autoFocus={!entry}
              invalid={!!errors.name}
              autoCapitalize="words"
            />
          </FormField>
          {others.map((f) => (
            <EntryFieldControl
              key={f.id}
              field={f}
              value={values[f.key] ?? ''}
              error={errors[f.key]}
              onChange={(v) => setValue(f.key, v)}
            />
          ))}
        </View>

        <FormField label="Link app user (optional)" hint="Linked users get match notifications.">
          {profile ? (
            <View style={[styles.linked, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <UserAvatar avatarUrl={profile.avatar_url} size={28} />
              <ThemedText style={{ flex: 1, fontWeight: '600' }}>@{profile.username}</ThemedText>
              <Pressable onPress={() => setProfile(null)} hitSlop={10} accessibilityLabel="Unlink user">
                <X size={18} color={theme.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setPickerOpen(true)} accessibilityRole="button">
              <View pointerEvents="none">
                <TextField editable={false} placeholder="Search username…" value="" />
              </View>
            </Pressable>
          )}
        </FormField>

        <Button label="Save entry" onPress={() => submit(false)} loading={saving === 'save'} disabled={!!saving} />
        {!entry && (
          <Button
            label="Save & add another"
            variant="secondary"
            onPress={() => submit(true)}
            loading={saving === 'another'}
            disabled={!!saving}
          />
        )}
      </ScrollView>

      <ProfilePickerSheet
        visible={pickerOpen}
        title="Link app user"
        onClose={() => setPickerOpen(false)}
        onSelect={(p) => {
          setProfile(p);
          setPickerOpen(false);
        }}
      />
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md },
  linked: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md },
});
