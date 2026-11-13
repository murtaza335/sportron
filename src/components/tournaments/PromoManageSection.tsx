import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { toast } from '@/components/motion/Toast';
import { FormField, PillSelect, SectionLabel, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { endTournamentPromo, fetchTournamentPromosManage, upsertTournamentPromo } from '@/services/tournaments';
import type { PromoDisplayMode, TournamentPromoAdmin } from '@/types';

const MODE_HINT: Record<PromoDisplayMode, string> = {
  reveal: 'Players tap a ticket to reveal the code.',
  visible: 'The code is shown to everyone straight away.',
  hidden: 'No card is shown. Players unlock it by long-pressing the tournament cover.',
};

const randomCode = () => String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');

/** "Discount code" admin section on the tournament manage screen (A8). */
export function PromoManageSection({ tournamentId }: { tournamentId: string }) {
  const theme = useTheme();
  const [promos, setPromos] = useState<TournamentPromoAdmin[]>([]);
  const [title, setTitle] = useState('');
  const [partner, setPartner] = useState('');
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<PromoDisplayMode>('reveal');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setPromos(await fetchTournamentPromosManage(tournamentId));
    } catch {
      setPromos([]);
    }
  }, [tournamentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const codeOk = /^\d{6}$/.test(code);
  const canCreate = title.trim().length > 0 && codeOk && !saving;

  const create = async () => {
    setSaving(true);
    try {
      await upsertTournamentPromo(tournamentId, null, {
        title: title.trim(),
        code,
        display_mode: mode,
        partner_name: partner.trim() || null,
        description: description.trim() || null,
      });
      setTitle('');
      setPartner('');
      setDescription('');
      setCode('');
      toast('Discount code published');
      await load();
    } catch (e) {
      alert('Something went wrong', friendlyTournamentError(e));
    } finally {
      setSaving(false);
    }
  };

  const end = (p: TournamentPromoAdmin) => {
    alert('End this discount code?', `"${p.title}" will disappear for players.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End code',
        style: 'destructive',
        onPress: async () => {
          try {
            await endTournamentPromo(p.id);
            await load();
          } catch (e) {
            alert('Something went wrong', friendlyTournamentError(e));
          }
        },
      },
    ]);
  };

  const active = promos.filter((p) => p.is_active);

  return (
    <View style={{ gap: Spacing.sm }}>
      <SectionLabel>Discount code</SectionLabel>
      <ThemedText variant="caption" muted>
        A 6-digit code players can find on the tournament page. Redeemed off-app (at the desk or with a partner).
      </ThemedText>

      {active.map((p) => (
        <View key={p.id} style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <ThemedText style={{ fontWeight: '700' }} numberOfLines={1}>{p.title}</ThemedText>
            <ThemedText variant="caption" muted>
              {p.code} · {p.display_mode} · {p.reveal_count} revealed
            </ThemedText>
          </View>
          <Button label="End" variant="ghost" onPress={() => end(p)} />
        </View>
      ))}

      <FormField label="Offer title">
        <TextField value={title} onChangeText={setTitle} maxLength={80} placeholder="10% off entry fee" />
      </FormField>
      <FormField label="Partner (optional)">
        <TextField value={partner} onChangeText={setPartner} maxLength={60} placeholder="Campus Café" />
      </FormField>
      <FormField label="Terms (optional)">
        <TextField value={description} onChangeText={setDescription} maxLength={500} multiline style={{ minHeight: 64, textAlignVertical: 'top' }} />
      </FormField>
      <FormField label="6-digit code" error={code.length > 0 && !codeOk ? 'Enter exactly 6 digits.' : null}>
        <TextField
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="482913"
        />
        <Button label="Generate" variant="secondary" onPress={() => setCode(randomCode())} />
      </FormField>
      <FormField label="How players find it" hint={MODE_HINT[mode]}>
        <PillSelect<PromoDisplayMode>
          options={[
            { value: 'reveal', label: 'Tap to reveal' },
            { value: 'visible', label: 'Visible' },
            { value: 'hidden', label: 'Hidden' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </FormField>
      <Button label="Publish code" onPress={create} disabled={!canCreate} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
});
