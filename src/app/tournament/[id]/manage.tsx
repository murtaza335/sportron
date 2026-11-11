import { pickImage as pickImageUri } from '@/lib/pickImage';
import { ChevronRight, FileText, Image as ImageIcon, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { FormField, PillSelect, SectionLabel, TextField } from '@/components/tournaments/form';
import { PromoManageSection } from '@/components/tournaments/PromoManageSection';
import { InfoPill, StatusPill } from '@/components/tournaments/StatusPill';
import { UserAvatar } from '@/components/UserAvatar';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { invalidateTournamentsCache } from '@/hooks/useTournaments';
import { useTournament } from '@/hooks/useTournament';
import { alert } from '@/lib/alert';
import { uploadImageFromUri } from '@/lib/cloudinary';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { moduleStatusTone, sportLabel } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { updateTournament } from '@/services/tournaments';
import type { TournamentStatus } from '@/types';

export default function TournamentManageScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { detail, loading, isTournamentAdmin, refresh } = useTournament(id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organization, setOrganization] = useState('');
  const [location, setLocation] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<TournamentStatus>('draft');
  const [saving, setSaving] = useState(false);

  const tournament = detail?.tournament;
  const updatedAt = tournament?.updated_at;
  useEffect(() => {
    // keep the form in sync with the server values after load / save
    if (!tournament) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setName(tournament.name);
    setDescription(tournament.description ?? '');
    setOrganization(tournament.organization ?? '');
    setLocation(tournament.location ?? '');
    setImageUri(tournament.image_url);
    setStartsAt(tournament.starts_at ? new Date(tournament.starts_at) : null);
    setEndsAt(tournament.ends_at ? new Date(tournament.ends_at) : null);
    setStatus(tournament.status);
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updatedAt, tournament?.id]);

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
  const nameOk = name.trim().length >= 3;
  const datesOk = !startsAt || !endsAt || endsAt >= startsAt;
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const dirty =
    name.trim() !== t.name ||
    description.trim() !== (t.description ?? '') ||
    organization.trim() !== (t.organization ?? '') ||
    location.trim() !== (t.location ?? '') ||
    imageUri !== t.image_url ||
    iso(startsAt) !== (t.starts_at ? new Date(t.starts_at).toISOString() : null) ||
    iso(endsAt) !== (t.ends_at ? new Date(t.ends_at).toISOString() : null) ||
    status !== t.status;
  const canSave = dirty && nameOk && datesOk && !saving;

  const pickImage = async () => {
    const uri = await pickImageUri();
    if (uri) setImageUri(uri);
  };

  const save = async () => {
    setSaving(true);
    try {
      let imageUrl = imageUri;
      if (imageUri && imageUri !== t.image_url) {
        const uploaded = await uploadImageFromUri(imageUri, undefined, undefined, 'cover');
        if (!uploaded) {
          alert('Error', 'Failed to upload image.');
          return;
        }
        imageUrl = uploaded;
      }
      await updateTournament(id, {
        name: name.trim(),
        description: description.trim() || null,
        organization: organization.trim() || null,
        location: location.trim() || null,
        image_url: imageUrl,
        starts_at: iso(startsAt),
        ends_at: iso(endsAt),
        status,
      });
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
      <FormField label="Cover image">
        {imageUri ? (
          <View>
            <Image source={{ uri: imageUri }} style={[styles.image, { backgroundColor: theme.border }]} resizeMode="cover" />
            <Pressable onPress={() => setImageUri(null)} hitSlop={12} style={[styles.imageRemove, { backgroundColor: theme.background }]} accessibilityLabel="Remove image">
              <X size={14} color={theme.text} strokeWidth={2.5} />
            </Pressable>
            <Pressable onPress={pickImage} hitSlop={12} style={[styles.imageChange, { backgroundColor: theme.background }]}>
              <ThemedText variant="caption" style={{ fontWeight: '700', fontSize: 11 }}>Change</ThemedText>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={pickImage} style={[styles.imagePicker, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ImageIcon size={24} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="caption" muted>Tap to select a cover image</ThemedText>
          </Pressable>
        )}
      </FormField>

      <FormField label="Name">
        <TextField value={name} onChangeText={setName} maxLength={80} invalid={name.trim().length > 0 && !nameOk} />
      </FormField>

      <FormField label="Description">
        <TextField value={description} onChangeText={setDescription} maxLength={2000} multiline style={{ minHeight: 96, textAlignVertical: 'top' }} />
      </FormField>

      <FormField label="Organization">
        <TextField value={organization} onChangeText={setOrganization} maxLength={80} />
      </FormField>

      <FormField label="Location">
        <TextField value={location} onChangeText={setLocation} maxLength={120} />
      </FormField>

      <FormField label="Starts">
        <DateTimeField value={startsAt} onChange={setStartsAt} placeholder="Select start" />
      </FormField>

      <FormField label="Ends" hint={!datesOk ? 'End must be after the start.' : undefined}>
        <DateTimeField value={endsAt} onChange={setEndsAt} placeholder="Select end" />
      </FormField>

      <FormField
        label="Status"
        hint="Draft is hidden. Published is visible to everyone. Completed and cancelled make the tournament read-only (you can switch back here)."
      >
        <PillSelect<TournamentStatus>
          options={[
            { value: 'draft', label: 'Draft' },
            { value: 'published', label: 'Published' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          value={status}
          onChange={setStatus}
        />
      </FormField>

      <Button label="Save changes" onPress={save} disabled={!canSave} loading={saving} />

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
            <InfoPill label={sportLabel(m.sport, m.custom_sport_name)} />
            <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>{m.name}</ThemedText>
            <StatusPill tone={moduleStatusTone(m.status)} />
            <ChevronRight size={18} color={theme.textSecondary} />
          </Pressable>
        ))}
        {writable && (
          <Button label="Add module" variant="secondary" onPress={() => router.push(tournamentRoutes.moduleForm(id))} />
        )}
      </View>

      <PromoManageSection tournamentId={id} />

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
  image: { width: '100%', height: 160, borderRadius: Radius.lg },
  imageRemove: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  imageChange: { position: 'absolute', bottom: 8, right: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full },
  imagePicker: { height: 110, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between' },
  admins: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  admin: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
