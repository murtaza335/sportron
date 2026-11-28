import { Check, Square } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { SectionLabel } from '@/components/tournaments/form';
import { ProfilePickerSheet } from '@/components/tournaments/ProfilePickerSheet';
import { SheetScrollView } from '@/components/motion/Sheet';
import { toast } from '@/components/motion/Toast';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTournament } from '@/hooks/useTournament';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { addModuleScorer, fetchModuleScorers, removeModuleScorer } from '@/services/tournaments';
import type { ProfileLite } from '@/types';

/**
 * "Scorers" on the sport's manage screen. Adding someone offers the other sports of this tournament
 * the caller also manages, so one volunteer can be added to several in one go.
 */
export function ScorersSection({
  tournamentId,
  moduleId,
  locked,
}: {
  tournamentId: string;
  moduleId: string;
  locked: boolean;
}) {
  const theme = useTheme();
  const { detail, isTournamentAdmin } = useTournament(tournamentId);
  const modules = detail?.modules;
  const [scorers, setScorers] = useState<ProfileLite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [chosen, setChosen] = useState<ProfileLite | null>(null);
  const [also, setAlso] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      setScorers(await fetchModuleScorers(moduleId));
      setError(null);
    } catch (e) {
      setError(friendlyTournamentError(e));
    }
  }, [moduleId]);

  useEffect(() => {
    let alive = true;
    fetchModuleScorers(moduleId).then(
      (r) => alive && setScorers(r),
      (e) => alive && setError(friendlyTournamentError(e)),
    );
    return () => {
      alive = false;
    };
  }, [moduleId]);

  const others = (modules ?? []).filter(
    (m) =>
      m.id !== moduleId &&
      m.status !== 'completed' &&
      m.status !== 'cancelled' &&
      (isTournamentAdmin || m.my_role === 'module_admin' || m.my_role === 'tournament_admin'),
  );

  const add = async (p: ProfileLite, extra: string[]) => {
    setChosen(null);
    setBusy(true);
    try {
      for (const id of [moduleId, ...extra]) await addModuleScorer(id, p.id);
      toast('Scorer added', `@${p.username} can now score.`);
    } catch (e) {
      alert('Couldn’t add the scorer', friendlyTournamentError(e));
    } finally {
      await load();
      setBusy(false);
    }
  };

  const pick = (p: ProfileLite) => {
    setPickerOpen(false);
    if (others.length === 0) return void add(p, []);
    setAlso([]);
    setChosen(p);
  };

  const remove = (p: ProfileLite) =>
    alert('Remove scorer?', `@${p.username} stops scoring this sport immediately.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await removeModuleScorer(moduleId, p.id);
          } catch (e) {
            alert('Something went wrong', friendlyTournamentError(e));
          } finally {
            await load();
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Scorers</SectionLabel>
      <ThemedText variant="caption" muted>
        Scorers can score and finish live matches. They can’t change rules, reset results or see phone numbers and emails.
      </ThemedText>
      {scorers === null && !error && <ActivityIndicator color={theme.text} />}
      {error && (
        <ThemedText variant="caption" style={{ color: theme.error }}>
          {error}
        </ThemedText>
      )}
      {scorers?.length === 0 && <ThemedText variant="caption" muted>No scorers yet.</ThemedText>}
      {scorers?.map((a) => (
        <View key={a.id} style={styles.row}>
          <UserAvatar avatarUrl={a.avatar_url} size={32} />
          <ThemedText style={{ flex: 1, fontWeight: '600' }}>@{a.username}</ThemedText>
          <Pressable onPress={() => remove(a)} hitSlop={10} accessibilityRole="button" disabled={busy}>
            <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '700' }}>Remove</ThemedText>
          </Pressable>
        </View>
      ))}
      {!locked && <Button label="Add scorer" variant="secondary" onPress={() => setPickerOpen(true)} loading={busy} />}

      <ProfilePickerSheet visible={pickerOpen} title="Add scorer" onClose={() => setPickerOpen(false)} onSelect={pick} />

      <BottomSheet visible={!!chosen} onClose={() => setChosen(null)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}>
          <ThemedText variant="heading">Add @{chosen?.username}</ThemedText>
          <ThemedText muted>Also add to other sports?</ThemedText>
          {others.map((m) => {
            const on = also.includes(m.id);
            return (
              <Pressable
                key={m.id}
                onPress={() => setAlso((v) => (on ? v.filter((x) => x !== m.id) : [...v, m.id]))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={styles.check}
              >
                {on ? <Check size={22} color={theme.accent} strokeWidth={3} /> : <Square size={22} color={theme.textSecondary} />}
                <ThemedText style={{ flex: 1, fontWeight: '600' }}>{m.name}</ThemedText>
              </Pressable>
            );
          })}
          <Button label="Add scorer" onPress={() => chosen && void add(chosen, also)} />
        </SheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  check: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minHeight: 44 },
});
