import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SheetScrollView } from '@/components/motion/Sheet';
import { toast } from '@/components/motion/Toast';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { FormField, SectionLabel, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { invalidateCached } from '@/hooks/useCachedLoad';
import { useTheme } from '@/hooks/use-theme';
import { invalidateTournamentsCache } from '@/hooks/useTournaments';
import { alert } from '@/lib/alert';
import { haptics } from '@/lib/haptics';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import {
  cancelTournament,
  deleteDraftTournament,
  fetchPublishCheck,
  publishTournament,
  setTournamentHidden,
} from '@/services/organizations';
import type { PublishCheck, TournamentDetail } from '@/types';

/** Publish / cancel / delete draft / hide for an organization tournament. */
export function OrgLifecycle({
  detail,
  onChanged,
  onDeleted,
}: {
  detail: TournamentDetail;
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const theme = useTheme();
  const t = detail.tournament;
  const isOrgAdmin = detail.my_org_role === 'admin';
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<PublishCheck | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const run = async (fn: () => Promise<void>, done: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      invalidateTournamentsCache();
      invalidateCached('org-');
      invalidateCached('work:');
      toast(done);
      if (after) after();
      else await onChanged();
    } catch (e) {
      haptics.error();
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    try {
      setCheck(await fetchPublishCheck(t.id));
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = () => {
    const hide = !t.hidden;
    alert(
      hide ? 'Hide this tournament?' : 'Show this tournament again?',
      hide
        ? 'Players and screens stop seeing it. Organizers, sport managers and scorers still do.'
        : 'It becomes visible again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: hide ? 'Hide' : 'Show',
          style: hide ? 'destructive' : 'default',
          onPress: () => void run(() => setTournamentHidden(t.id, hide), hide ? 'Hidden' : 'Visible again'),
        },
      ],
    );
  };

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Status</SectionLabel>
      {t.status === 'draft' && (
        <>
          <ThemedText variant="caption" muted>Draft: only you and organization admins can see it.</ThemedText>
          <Button label="Preview and publish" onPress={() => void preview()} loading={busy && !check} />
          <Button label="Delete draft" variant="ghost" buttonStyle={{ borderColor: theme.error }} disabled={busy} onPress={() => { setTyped(''); setDeleteOpen(true); }} />
        </>
      )}
      {t.status === 'published' && (
        <>
          <ThemedText variant="caption" muted>
            Published: everyone can see it. It finishes by itself as sports complete; mark it completed from the Sportron team if needed.
          </ThemedText>
          <Button label="Cancel tournament" variant="ghost" buttonStyle={{ borderColor: theme.error }} disabled={busy} onPress={() => { setReason(''); setCancelOpen(true); }} />
        </>
      )}
      {(t.status === 'completed' || t.status === 'cancelled') && (
        <ThemedText variant="caption" muted>This tournament is {t.status} and can’t be changed.</ThemedText>
      )}
      {isOrgAdmin && (
        <Button label={t.hidden ? 'Show again' : 'Hide tournament'} variant="secondary" disabled={busy} onPress={toggleHidden} />
      )}

      <BottomSheet visible={!!check} onClose={() => setCheck(null)}>
        {check && (
          <SheetScrollView contentContainerStyle={styles.sheet}>
            <ThemedText variant="heading">Publish “{t.name}”?</ThemedText>
            <ThemedText muted>
              Players will see {detail.modules.length} {detail.modules.length === 1 ? 'sport' : 'sports'}.
            </ThemedText>
            {detail.modules.map((m) => (
              <ThemedText key={m.id}>• {m.name}</ThemedText>
            ))}
            {check.problems.map((p) => (
              <ThemedText key={p} style={{ color: theme.error, fontWeight: '700' }}>✕ {p}</ThemedText>
            ))}
            {check.warnings.map((w) => (
              <ThemedText key={w} muted>! {w}</ThemedText>
            ))}
            <Button
              label="Publish"
              loading={busy}
              disabled={check.problems.length > 0}
              onPress={() => {
                void run(() => publishTournament(t.id), 'Published').then(() => setCheck(null));
              }}
            />
            <Button label="Not yet" variant="ghost" onPress={() => setCheck(null)} />
          </SheetScrollView>
        )}
      </BottomSheet>

      <BottomSheet visible={cancelOpen} onClose={() => setCancelOpen(false)}>
        <SheetScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Cancel this tournament?</ThemedText>
          <ThemedText muted>
            Everyone sees it as cancelled, live matches stop and nothing can be changed any more.
          </ThemedText>
          <FormField label="Reason (optional, for your organization's history)">
            <TextField value={reason} onChangeText={setReason} maxLength={200} />
          </FormField>
          <Button
            label="Cancel tournament"
            variant="ghost"
            buttonStyle={{ borderColor: theme.error }}
            loading={busy}
            onPress={() => {
              void run(() => cancelTournament(t.id, reason.trim() || null), 'Tournament cancelled').then(() => setCancelOpen(false));
            }}
          />
          <Button label="Keep it" onPress={() => setCancelOpen(false)} />
        </SheetScrollView>
      </BottomSheet>

      <BottomSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <SheetScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <ThemedText variant="heading">Delete this draft?</ThemedText>
          <ThemedText muted>Its sports and players are deleted. This can’t be undone.</ThemedText>
          <FormField label={`Type “${t.name}” to confirm`}>
            <TextField value={typed} onChangeText={setTyped} autoCorrect={false} />
          </FormField>
          <Button
            label="Delete forever"
            variant="ghost"
            buttonStyle={{ borderColor: theme.error }}
            loading={busy}
            disabled={typed.trim() !== t.name.trim()}
            onPress={() => {
              void run(() => deleteDraftTournament(t.id, typed.trim()), 'Draft deleted', () => {
                setDeleteOpen(false);
                onDeleted();
              });
            }}
          />
          <Button label="Keep it" onPress={() => setDeleteOpen(false)} />
        </SheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { gap: Spacing.sm, paddingBottom: Spacing.lg },
});
