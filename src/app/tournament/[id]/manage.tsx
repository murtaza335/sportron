import { Check, ChevronRight, FileText } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FormField, SectionLabel, TextField } from '@/components/tournaments/form';
import { InfoPill, StatusPill } from '@/components/tournaments/StatusPill';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { invalidateTournamentsCache } from '@/hooks/useTournaments';
import { useTournament } from '@/hooks/useTournament';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { moduleStatusTone, sportLabel } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { renameTournament } from '@/services/tournaments';

export default function TournamentManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detail, loading, isTournamentAdmin, refresh } = useTournament(id);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const savedName = detail?.tournament.name ?? '';
  useEffect(() => {
    // keep the input in sync with the server value after load / rename
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(savedName);
  }, [savedName]);

  if (loading && !detail) return <ActivityIndicator color={theme.text} style={{ marginTop: Spacing.xxl }} />;
  if (!detail || !isTournamentAdmin) {
    return (
      <View style={styles.denied}>
        <ThemedText variant="heading">No access</ThemedText>
        <ThemedText muted>Only tournament admins can manage a tournament.</ThemedText>
      </View>
    );
  }

  const t = detail.tournament;
  const writable = t.status !== 'completed' && t.status !== 'cancelled';
  const dirty = name.trim() !== savedName && name.trim().length >= 3;

  const save = async () => {
    setSaving(true);
    try {
      await renameTournament(id, name.trim());
      invalidateTournamentsCache();
      await refresh();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
      keyboardShouldPersistTaps="handled"
    >
      <FormField label="Name" hint="Other details are managed by the Sportron team.">
        <View style={styles.nameRow}>
          <TextField
            value={name}
            onChangeText={setName}
            maxLength={80}
            editable={writable}
            style={{ flex: 1 }}
            invalid={name.trim().length > 0 && name.trim().length < 3}
          />
          {dirty && writable && (
            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: theme.text }, (pressed || saving) && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel="Save name"
            >
              {saving ? <ActivityIndicator color={theme.background} /> : <Check size={22} color={theme.background} strokeWidth={3} />}
            </Pressable>
          )}
        </View>
      </FormField>

      <Pressable
        onPress={() => router.push(tournamentRoutes.fields(id))}
        style={({ pressed }) => [styles.linkRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
      >
        <FileText size={20} color={theme.text} strokeWidth={2} />
        <ThemedText style={{ flex: 1, fontWeight: '600' }}>Entry form</ThemedText>
        <ChevronRight size={18} color={theme.textSecondary} />
      </Pressable>

      <View style={{ gap: Spacing.sm }}>
        <View style={styles.sectionHead}>
          <SectionLabel>Modules</SectionLabel>
          <SectionLabel>{String(detail.modules.length)}</SectionLabel>
        </View>
        {detail.modules.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push(tournamentRoutes.moduleManage(id, m.id))}
            style={({ pressed }) => [styles.linkRow, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
          >
            <InfoPill label={sportLabel(m.sport)} />
            <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{m.name}</ThemedText>
            <StatusPill tone={moduleStatusTone(m.status)} />
            <ChevronRight size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
        {writable && (
          <Button label="Add module" variant="secondary" onPress={() => router.push(tournamentRoutes.moduleForm(id))} />
        )}
      </View>

      <View style={{ gap: Spacing.sm }}>
        <SectionLabel>Tournament admins</SectionLabel>
        <View style={styles.admins}>
          {detail.admins.map((a) => (
            <View key={a.id} style={styles.admin}>
              <UserAvatar avatarUrl={a.avatar_url} size={28} />
              <ThemedText variant="caption">@{a.username}</ThemedText>
            </View>
          ))}
        </View>
        <ThemedText variant="caption" muted>Tournament admins are assigned by the Sportron team.</ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  denied: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.lg },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  saveBtn: { width: 52, height: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between' },
  admins: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
