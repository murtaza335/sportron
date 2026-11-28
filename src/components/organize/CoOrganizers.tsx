import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { SheetScrollView } from '@/components/motion/Sheet';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { SectionLabel } from '@/components/tournaments/form';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { addCoOrganizer, fetchOrgMembers, removeCoOrganizer } from '@/services/organizations';
import type { OrgMember, ProfileLite, TournamentDetail } from '@/types';

/** Co-organizers of one organization tournament. Only members of the organization can be added. */
export function CoOrganizers({ detail, onChanged }: { detail: TournamentDetail; onChanged: () => Promise<void> }) {
  const theme = useTheme();
  const t = detail.tournament;
  const writable = t.status !== 'completed' && t.status !== 'cancelled';
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<OrgMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setOpen(true);
    setError(null);
    try {
      setMembers(await fetchOrgMembers(t.organization_id!));
    } catch (e) {
      setError(friendlyTournamentError(e));
    }
  };

  const remove = (a: ProfileLite) =>
    alert('Remove co-organizer?', `@${a.username} will no longer manage this tournament.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void run(() => removeCoOrganizer(t.id, a.id)) },
    ]);

  const candidates = (members ?? []).filter((m) => !detail.admins.some((a) => a.id === m.profile_id));

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Co-organizers</SectionLabel>
      <ThemedText variant="caption" muted>
        Organization admins can always manage this tournament.
      </ThemedText>
      {detail.admins.map((a) => (
        <View key={a.id} style={styles.row}>
          <UserAvatar avatarUrl={a.avatar_url} size={32} />
          <ThemedText style={{ flex: 1, fontWeight: '600' }}>@{a.username}</ThemedText>
          {writable && (
            <Pressable onPress={() => remove(a)} hitSlop={10} disabled={busy} accessibilityRole="button">
              <ThemedText variant="caption" style={{ color: theme.error, fontWeight: '700' }}>Remove</ThemedText>
            </Pressable>
          )}
        </View>
      ))}
      {writable && <Button label="Add co-organizer" variant="secondary" onPress={() => void openPicker()} loading={busy} />}

      <BottomSheet visible={open} onClose={() => setOpen(false)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}>
          <ThemedText variant="heading">Add co-organizer</ThemedText>
          {error ? (
            <ThemedText style={{ color: theme.error }}>{error}</ThemedText>
          ) : members === null ? (
            <ActivityIndicator color={theme.text} />
          ) : candidates.length === 0 ? (
            <ThemedText muted>
              Everyone in the organization is already here. An organization admin can add more organizers.
            </ThemedText>
          ) : (
            candidates.map((m) => (
              <Pressable
                key={m.profile_id}
                accessibilityRole="button"
                style={({ pressed }) => [styles.row, { minHeight: 48 }, pressed && { opacity: 0.6 }]}
                onPress={() => {
                  setOpen(false);
                  void run(() => addCoOrganizer(t.id, m.profile_id));
                }}
              >
                <UserAvatar avatarUrl={m.avatar_url} size={36} />
                <ThemedText style={{ fontWeight: '600' }}>@{m.username}</ThemedText>
              </Pressable>
            ))
          )}
        </SheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
