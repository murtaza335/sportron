import { Check, Image as ImageIcon } from 'lucide-react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HeaderBack } from '@/components/HeaderBack';
import { toast } from '@/components/motion/Toast';
import { DateTimeField } from '@/components/tournaments/DateTimeField';
import { FormField, PillSelect, TextField } from '@/components/tournaments/form';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { invalidateCached } from '@/hooks/useCachedLoad';
import { useMyWork } from '@/hooks/useMyWork';
import { useTheme } from '@/hooks/use-theme';
import { invalidateTournamentsCache } from '@/hooks/useTournaments';
import { alert } from '@/lib/alert';
import { uploadImageFromUri } from '@/lib/cloudinary';
import { haptics } from '@/lib/haptics';
import { buildModules, WIZARD_OPTIONS, WIZARD_SPORTS, type TeamFormat, type WizardSport } from '@/lib/organizeSports';
import { pickImage } from '@/lib/pickImage';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import {
  createOrgModules,
  createOrgTournament,
  publishTournament,
} from '@/services/organizations';

type Step = 1 | 2 | 3;

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, { borderColor: selected ? theme.text : theme.border, backgroundColor: selected ? theme.text : theme.backgroundElement }]}
    >
      {selected && <Check size={16} color={theme.background} strokeWidth={3} />}
      <ThemedText style={{ color: selected ? theme.background : theme.text, fontWeight: '700' }}>{label}</ThemedText>
    </Pressable>
  );
}

export default function NewTournamentScreen() {
  const { org: orgId } = useLocalSearchParams<{ org: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgs } = useMyWork();
  const org = orgs.find((o) => o.id === orgId) ?? orgs[0] ?? null;

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [sports, setSports] = useState<WizardSport[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [formats, setFormats] = useState<Record<string, TeamFormat>>({});
  const [moreOptions, setMoreOptions] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);

  const place = location ?? org?.short_name ?? org?.name ?? '';
  const datesOk = !startsAt || !endsAt || endsAt >= startsAt;
  const step1Ok = name.trim().length >= 3 && !!startsAt && datesOk;
  const selected = WIZARD_OPTIONS.filter((o) => chosen.includes(o.key) && sports.includes(o.sport));

  const toggleSport = (s: WizardSport) =>
    setSports((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]));
  const toggle = (key: string) =>
    setChosen((v) => (v.includes(key) ? v.filter((x) => x !== key) : [...v, key]));

  const save = async (publish: boolean) => {
    if (!org || !startsAt) return;
    setBusy(publish ? 'publish' : 'draft');
    let id: string | null = null;
    try {
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadImageFromUri(imageUri, undefined, undefined, 'cover');
        if (!imageUrl) throw new Error('Failed to upload the cover image.');
      }
      id = await createOrgTournament(org.id, {
        name: name.trim(),
        location: place.trim() || null,
        image_url: imageUrl,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt ? endsAt.toISOString() : null,
      });
      await createOrgModules(id, buildModules(selected.map((o) => o.key), formats));
      if (publish) await publishTournament(id);
      haptics.success();
      toast(publish ? 'Tournament published' : 'Draft saved', 'Next: add players.');
    } catch (e) {
      haptics.error();
      alert(
        id ? 'Saved as a draft, but not finished' : 'Couldn’t create the tournament',
        friendlyTournamentError(e),
      );
      if (!id) {
        setBusy(null);
        return;
      }
    }
    invalidateCached('org-');
    invalidateCached('work:');
    invalidateTournamentsCache();
    router.replace(tournamentRoutes.tournament(id));
  };

  const publish = () => {
    const count = selected.length;
    alert(
      'Publish now?',
      `Everyone will see “${name.trim()}” and its ${count} ${count === 1 ? 'sport' : 'sports'}. You can add players afterwards.`,
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Publish', onPress: () => void save(true) },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{ title: `New tournament · ${step} of 3`, headerShown: true, headerLeft: () => <HeaderBack fallback={tournamentRoutes.organize(orgId)} /> }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <>
            <ThemedText variant="heading">Name and dates</ThemedText>
            <FormField label="Tournament name">
              <TextField value={name} onChangeText={setName} maxLength={80} placeholder="Inter-School Badminton 2027" />
            </FormField>
            <FormField label="Starts">
              <DateTimeField value={startsAt} onChange={setStartsAt} placeholder="Select start" />
            </FormField>
            <FormField label="Ends (optional)" hint={!datesOk ? 'End must be after the start.' : undefined}>
              <DateTimeField value={endsAt} onChange={setEndsAt} placeholder="Select end" />
            </FormField>
            <FormField label="Location">
              <TextField value={place} onChangeText={setLocation} maxLength={120} />
            </FormField>
            <FormField label="Cover image (optional)">
              <Pressable
                onPress={async () => {
                  const uri = await pickImage();
                  if (uri) setImageUri(uri);
                }}
                style={[styles.imagePicker, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
                accessibilityRole="button"
              >
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
                ) : (
                  <>
                    <ImageIcon size={24} color={theme.textSecondary} strokeWidth={1.5} />
                    <ThemedText variant="caption" muted>Tap to select a cover image</ThemedText>
                  </>
                )}
              </Pressable>
            </FormField>
            <Button label="Next: pick sports" disabled={!step1Ok} onPress={() => setStep(2)} />
          </>
        )}

        {step === 2 && (
          <>
            <ThemedText variant="heading">Pick sports</ThemedText>
            <View style={styles.wrap}>
              {WIZARD_SPORTS.map((s) => (
                <Chip key={s.sport} label={s.label} selected={sports.includes(s.sport)} onPress={() => toggleSport(s.sport)} />
              ))}
            </View>
            {WIZARD_SPORTS.filter((s) => sports.includes(s.sport)).map((s) => (
              <View key={s.sport} style={{ gap: Spacing.sm }}>
                <ThemedText variant="label" muted>{s.label}: which competitions?</ThemedText>
                <View style={styles.wrap}>
                  {WIZARD_OPTIONS.filter((o) => o.sport === s.sport).map((o) => (
                    <Chip key={o.key} label={o.label} selected={chosen.includes(o.key)} onPress={() => toggle(o.key)} />
                  ))}
                </View>
              </View>
            ))}
            <ThemedText variant="caption" muted>Another sport? Add it from the tournament page afterwards.</ThemedText>
            {selected.some((o) => o.formatChoice) && (
              <View style={{ gap: Spacing.sm }}>
                <Pressable onPress={() => setMoreOptions((v) => !v)} accessibilityRole="button" hitSlop={8}>
                  <ThemedText style={{ color: theme.accent, fontWeight: '700' }}>
                    {moreOptions ? 'Hide options' : 'More options'}
                  </ThemedText>
                </Pressable>
                {moreOptions &&
                  selected
                    .filter((o) => o.formatChoice)
                    .map((o) => (
                      <FormField key={o.key} label={`${o.name}: format`} hint="You can change it until the draw is made.">
                        <PillSelect<TeamFormat>
                          options={[
                            { value: 'round_robin', label: 'League' },
                            { value: 'single_elimination', label: 'Knockout' },
                          ]}
                          value={formats[o.key] ?? 'round_robin'}
                          onChange={(v) => setFormats((f) => ({ ...f, [o.key]: v }))}
                        />
                      </FormField>
                    ))}
              </View>
            )}
            <Button label="Next: review" disabled={selected.length === 0 || selected.length > 20} onPress={() => setStep(3)} />
            <Button label="Back" variant="ghost" onPress={() => setStep(1)} />
          </>
        )}

        {step === 3 && startsAt && (
          <>
            <ThemedText variant="heading">Review</ThemedText>
            <View style={[styles.box, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={{ fontWeight: '800', fontSize: 18 }}>{name.trim()}</ThemedText>
              <ThemedText muted>
                {startsAt.toLocaleDateString()}
                {endsAt ? ` – ${endsAt.toLocaleDateString()}` : ''}
                {place ? ` · ${place}` : ''}
              </ThemedText>
              <ThemedText muted>{org?.name}</ThemedText>
            </View>
            <ThemedText variant="label" muted>{selected.length} {selected.length === 1 ? 'sport' : 'sports'}</ThemedText>
            {selected.map((o) => (
              <ThemedText key={o.key}>• {o.name}</ThemedText>
            ))}
            <Button label="Save as draft" loading={busy === 'draft'} disabled={!!busy || !org} onPress={() => void save(false)} />
            <Button label="Save and publish" variant="secondary" loading={busy === 'publish'} disabled={!!busy || !org} onPress={publish} />
            <ThemedText variant="caption" muted>A draft is only visible to you and your organization admins.</ThemedText>
            <Button label="Back" variant="ghost" disabled={!!busy} onPress={() => setStep(2)} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.full, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, gap: 4 },
  imagePicker: { height: 120, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', gap: 4, overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
});
