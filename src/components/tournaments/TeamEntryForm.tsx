import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { Crown, Pencil, Plus, TriangleAlert, X } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { emptyMember, MemberSheet, type MemberDraft } from '@/components/tournaments/MemberSheet';
import { FormField, TextField } from '@/components/tournaments/form';
import { ProfilePickerSheet } from '@/components/tournaments/ProfilePickerSheet';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError, playerIndexFromError } from '@/lib/tournamentErrors';
import { isDoubles, validateFieldValue } from '@/lib/tournamentFormat';
import { upsertTeamEntry } from '@/services/tournaments';
import type {
  TeamMemberInput,
  TournamentEntry,
  TournamentEntryField,
  TournamentModule,
} from '@/types';
import { isTeamSport } from '@/types';

let keySeq = 0;
const nextKey = () => `m${++keySeq}`;

function draftsFromEntry(entry: TournamentEntry | null, module: TournamentModule): MemberDraft[] {
  if (entry) {
    return entry.members.map((m) => ({
      key: nextKey(),
      id: m.id,
      name: m.name,
      profile: m.profile,
      values: m.fields,
      is_captain: m.is_captain,
      squad: m.squad_number != null ? String(m.squad_number) : '',
    }));
  }
  // doubles: two fixed player slots
  return isDoubles(module) ? [emptyMember(nextKey()), emptyMember(nextKey())] : [];
}

/** Team (roster) variant of the entry form — PLAN-v2 §9.3. */
export function TeamEntryForm({
  module,
  fields,
  entry,
  bottomInset,
  onClose,
}: {
  module: TournamentModule;
  fields: TournamentEntryField[];
  entry: TournamentEntry | null;
  bottomInset: number;
  onClose: () => void;
}) {
  const theme = useTheme();
  const doubles = isDoubles(module);
  const min = module.roster_min ?? 1;
  const max = module.roster_max ?? 40;
  const others = fields.filter((f) => f.key !== 'name');
  const labels = Object.fromEntries(fields.map((f) => [f.key, f.label]));
  const scrollRef = useRef<ScrollView>(null);

  const [teamName, setTeamName] = useState(entry?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!entry);
  const [members, setMembers] = useState<MemberDraft[]>(() => draftsFromEntry(entry, module));
  const [teamError, setTeamError] = useState<string | null>(null);
  const [memberErrors, setMemberErrors] = useState<Record<number, Record<string, string>>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState<'save' | 'another' | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const filled = members.filter((m) => m.name.trim()).length;
  const belowMin = members.length < min;

  /** Doubles: the team name follows "P1 / P2" until the admin types their own. */
  const autoName = (list: MemberDraft[]) =>
    list
      .map((m) => m.name.trim())
      .filter(Boolean)
      .join(' / ');

  const patchMember = (i: number, patch: Partial<MemberDraft>) => {
    setMembers((prev) => {
      const next = prev.map((m, idx) => {
        if (idx === i) return { ...m, ...patch };
        // turning captain on clears it on everyone else
        return patch.is_captain ? { ...m, is_captain: false } : m;
      });
      if (doubles && !nameTouched && patch.name !== undefined) setTeamName(autoName(next));
      return next;
    });
    setMemberErrors((prev) => (prev[i] ? { ...prev, [i]: {} } : prev));
  };

  const removeMember = (i: number) => {
    setMembers((prev) => prev.filter((_, idx) => idx !== i));
    setMemberErrors({});
  };

  const addMember = () => {
    if (members.length >= max) return;
    setMembers((prev) => [...prev, emptyMember(nextKey())]);
    setEditing(members.length);
  };

  /** Mirrors the server validation per member. Returns the first invalid index or null. */
  const validate = (): number | null => {
    let firstBad: number | null = null;
    const errs: Record<number, Record<string, string>> = {};
    members.forEach((m, i) => {
      const e: Record<string, string> = {};
      if (!m.name.trim()) e.name = 'Name is required.';
      for (const f of others) {
        const err = validateFieldValue(f, m.values[f.key] ?? '');
        if (err) e[f.key] = err;
      }
      if (Object.keys(e).length) {
        errs[i] = e;
        if (firstBad === null) firstBad = i;
      }
    });
    setMemberErrors(errs);
    return firstBad;
  };

  const submit = async (another: boolean) => {
    if (!teamName.trim()) {
      setTeamError('Team name is required.');
      return;
    }
    const bad = validate();
    if (bad !== null) {
      setEditing(bad);
      return;
    }
    setSaving(another ? 'another' : 'save');
    try {
      const payload: TeamMemberInput[] = members.map((m) => {
        const clean: Record<string, string> = {};
        for (const f of others) {
          const v = (m.values[f.key] ?? '').trim();
          if (v) clean[f.key] = v;
        }
        return {
          ...(m.id ? { id: m.id } : {}),
          name: m.name.trim(),
          profile_id: m.profile?.id ?? null,
          field_values: clean,
          is_captain: m.is_captain,
          squad_number: m.squad.trim() === '' ? null : parseInt(m.squad, 10),
        };
      });
      await upsertTeamEntry(module.id, entry?.id ?? null, teamName.trim(), payload);
      if (another) {
        setTeamName('');
        setNameTouched(false);
        setMembers(draftsFromEntry(null, module));
        setMemberErrors({});
        setTeamError(null);
        setResetKey((k) => k + 1);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        onClose();
      }
    } catch (e) {
      const msg = friendlyTournamentError(e, labels);
      const raw = e instanceof Error ? e.message : '';
      const idx = playerIndexFromError(e);
      const key = raw.match(/FIELD_(?:REQUIRED|INVALID):([a-z0-9_]+)/)?.[1];
      if (idx !== null && idx < members.length) {
        setMemberErrors((prev) => ({ ...prev, [idx]: { [key ?? (raw.includes('CMS') ? 'cms_id' : 'name')]: msg } }));
        setEditing(idx);
      } else if (raw.includes('FIELD_REQUIRED:name') || raw.includes('FIELD_INVALID:name')) {
        setTeamError(msg);
      } else {
        alert('Something went wrong', msg);
      }
    } finally {
      setSaving(null);
    }
  };

  const editingMember = editing !== null ? members[editing] ?? null : null;
  const memberTitle = (i: number) => (doubles ? `Player ${i + 1}` : members[i]?.name.trim() || `Player ${i + 1}`);

  return (
    <KeyboardAvoider style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.container, { paddingBottom: bottomInset + Spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View key={resetKey} style={{ gap: Spacing.md }}>
          <FormField label={doubles ? 'PAIR NAME *' : 'TEAM NAME *'} error={teamError}>
            <TextField
              value={teamName}
              onChangeText={(v) => {
                setTeamName(v);
                setNameTouched(true);
                if (teamError) setTeamError(null);
              }}
              placeholder={doubles ? 'Auto-filled from the players' : 'e.g. Thunder FC'}
              maxLength={60}
              autoFocus={!entry}
              invalid={!!teamError}
              autoCapitalize="words"
            />
          </FormField>

          <View style={styles.countRow}>
            <ThemedText variant="label" muted>PLAYERS</ThemedText>
            <ThemedText
              variant="caption"
              style={{ fontWeight: '700', color: belowMin ? theme.warning : theme.textSecondary }}
            >
              {members.length} / {min === max ? max : `${min}–${max}`}
            </ThemedText>
            {belowMin && <TriangleAlert size={14} color={theme.warning} strokeWidth={2} />}
          </View>

          <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            {members.length === 0 && (
              <ThemedText muted style={{ padding: Spacing.md }}>No players yet.</ThemedText>
            )}
            {members.map((m, i) => {
              const hasErr = !!memberErrors[i] && Object.values(memberErrors[i]).some(Boolean);
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setEditing(i)}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit player ${i + 1}`}
                >
                  <View style={[styles.num, { backgroundColor: theme.backgroundSelected }]}>
                    <ThemedText variant="caption" style={{ fontWeight: '700' }}>{i + 1}</ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{ fontWeight: '600', color: m.name.trim() ? theme.text : theme.textSecondary }}
                      numberOfLines={1}
                    >
                      {m.name.trim() || (doubles ? `Player ${i + 1} — tap to fill in` : 'New player')}
                    </ThemedText>
                    {hasErr && (
                      <ThemedText variant="caption" style={{ color: theme.error }}>
                        Needs attention
                      </ThemedText>
                    )}
                  </View>
                  {m.is_captain && <Crown size={14} color={theme.warning} strokeWidth={2} />}
                  {m.squad !== '' && (
                    <ThemedText variant="caption" muted>#{m.squad}</ThemedText>
                  )}
                  <Pencil size={14} color={theme.textSecondary} strokeWidth={2} />
                  {!doubles && (
                    <Pressable
                      onPress={() => removeMember(i)}
                      hitSlop={10}
                      accessibilityLabel={`Remove player ${i + 1}`}
                    >
                      <X size={16} color={theme.textSecondary} strokeWidth={2} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </View>

          {!doubles && members.length < max && (
            <Button
              label="Add player"
              variant="secondary"
              icon={<Plus size={16} color={theme.text} strokeWidth={2.5} />}
              onPress={addMember}
            />
          )}
          {belowMin && filled > 0 && (
            <ThemedText variant="caption" muted>
              Teams need at least {min} players before seeding. You can save now and finish later.
            </ThemedText>
          )}
        </View>

        <Button label="Save team" onPress={() => submit(false)} loading={saving === 'save'} disabled={!!saving} />
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

      <MemberSheet
        visible={editing !== null && !picking}
        title={editing !== null ? memberTitle(editing) : ''}
        member={editingMember}
        fields={fields}
        errors={editing !== null ? memberErrors[editing] ?? {} : {}}
        showSquad={isTeamSport(module.sport) || module.sport === 'other'}
        showCaptain={!doubles}
        onChange={(patch) => editing !== null && patchMember(editing, patch)}
        onPickUser={() => setPicking(true)}
        onClose={() => setEditing(null)}
      />
      <ProfilePickerSheet
        visible={picking}
        title="Link app user"
        onClose={() => setPicking(false)}
        onSelect={(p) => {
          if (editing !== null) patchMember(editing, { profile: p });
          setPicking(false);
        }}
      />
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginLeft: Spacing.xs },
  list: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.md },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
