import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { FormField, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Spacing } from '@/constants/theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { scheduleMatch } from '@/services/tournaments';
import type { TournamentMatch } from '@/types';

export function ScheduleSheet({
  match,
  onClose,
  onSaved,
}: {
  match: TournamentMatch | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  return (
    <BottomSheet visible={!!match} onClose={onClose}>
      {match && <ScheduleBody key={match.id} match={match} onClose={onClose} onSaved={onSaved} />}
    </BottomSheet>
  );
}

function ScheduleBody({
  match,
  onClose,
  onSaved,
}: {
  match: TournamentMatch;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [at, setAt] = useState<Date | null>(match.scheduled_at ? new Date(match.scheduled_at) : null);
  const [venue, setVenue] = useState(match.venue ?? '');
  const [court, setCourt] = useState(match.court ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await scheduleMatch(match.id, at ? at.toISOString() : null, venue.trim() || null, court.trim() || null);
      await onSaved();
      onClose();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: Spacing.md, paddingBottom: Spacing.md }}>
      <ThemedText variant="heading" style={{ fontSize: 20, lineHeight: 26 }}>
        Schedule · {match.is_third_place ? '3rd Place' : match.round_name}
      </ThemedText>
      <FormField label="Date & time">
        <DateTimeField value={at} onChange={setAt} />
      </FormField>
      <FormField label="Venue">
        <TextField value={venue} onChangeText={setVenue} placeholder="e.g. Main Hall" maxLength={120} />
      </FormField>
      <FormField label="Court / table">
        <TextField value={court} onChangeText={setCourt} placeholder="e.g. Table 2" maxLength={40} />
      </FormField>
      <Button label="Save schedule" onPress={save} loading={saving} />
    </View>
  );
}
