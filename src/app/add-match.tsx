import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchLineupSelector } from '@/components/MatchLineupSelector';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { ScoreCounter } from '@/components/ScoreCounter';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { createMatch } from '@/services/matches';
import { fetchAllProfiles } from '@/services/profiles';
import type { MatchFormat, Profile } from '@/types';

type SelectionState = {
  playerPartner: Profile | null;
  opponent: Profile | null;
  opponentPartner: Profile | null;
};

export default function AddMatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, profile } = useAuth();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('doubles');
  const [selection, setSelection] = useState<SelectionState>({
    playerPartner: null,
    opponent: null,
    opponentPartner: null,
  });
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAllProfiles(user?.id)
      .then((data) => { if (!cancelled) setProfiles(data); })
      .catch((error) => console.error('Failed to load profiles:', error));
    return () => { cancelled = true; };
  }, [user?.id]);

  const canSave =
    (matchFormat === 'singles'
      ? selection.opponent !== null
      : selection.playerPartner !== null &&
        selection.opponent !== null &&
        selection.opponentPartner !== null) &&
    (playerScore > 0 || opponentScore > 0);

  const handleSave = async () => {
    if (!user?.id || !canSave) return;
    setSaving(true);
    try {
      const isOpponentGuest = selection.opponent?.id?.startsWith('guest-');
      const isOpponentPartnerGuest = selection.opponentPartner?.id?.startsWith('guest-');
      const isPlayerPartnerGuest = selection.playerPartner?.id?.startsWith('guest-');

      // For singles with guest opponent, the opponent guest name is stored in opponentGuestName
      // For doubles with guest opponent, also use opponentGuestName
      // For guest partner, we can't store it in DB (only one guest field), so just treat as null
      await createMatch(user.id, {
        matchFormat,
        playerPartnerId: isPlayerPartnerGuest ? null : selection.playerPartner?.id ?? null,
        opponentId: isOpponentGuest ? null : selection.opponent?.id ?? null,
        opponentPartnerId: isOpponentPartnerGuest ? null : selection.opponentPartner?.id ?? null,
        opponentGuestName: (isOpponentGuest || isOpponentPartnerGuest) ? 'Guest' : null,
        playerScore,
        opponentScore,
        isPublic,
      });
      router.back();
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save match');
    } finally {
      setSaving(false);
    }
  };

return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerAction}>
            <X size={24} color={theme.text} strokeWidth={2} />
          </Pressable>
          <ThemedText variant="heading" style={styles.title}>New Match</ThemedText>
          <Pressable
            onPress={handleSave}
            hitSlop={16}
            disabled={!canSave || saving}
            style={({ pressed }) => [
              styles.saveAction,
              (!canSave || saving) && styles.disabled,
              pressed && canSave && !saving && styles.pressed,
            ]}>
            <ThemedText style={[styles.saveLabel, { color: canSave && !saving ? theme.text : theme.textSecondary }]}>
              Save
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Format Selector */}
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionLabel}>Match Format</ThemedText>
            <SegmentedControl
              options={[
                { value: 'singles', label: 'Singles (1v1)' },
                { value: 'doubles', label: 'Doubles (2v2)' },
              ]}
              value={matchFormat}
              onChange={(value) => {
                setMatchFormat(value as MatchFormat);
                setSelection({
                  playerPartner: null,
                  opponent: null,
                  opponentPartner: null,
                });
              }}
            />
          </View>

          {/* Lineup Selector */}
          <View style={styles.section}>
            <MatchLineupSelector
              profiles={profiles}
              currentUserName={profile?.display_name ?? 'You'}
              format={matchFormat}
              selection={selection}
              onChange={(slot, selectedProfile) =>
                setSelection((current) => ({ ...current, [slot]: selectedProfile }))
              }
            />
          </View>

          {/* Score Input */}
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionLabel}>Scores</ThemedText>
            <View style={styles.scores}>
              <ScoreCounter
                label="Team A"
                score={playerScore}
                onIncrement={() => setPlayerScore((v) => v + 1)}
                onDecrement={() => setPlayerScore((v) => Math.max(0, v - 1))}
                onScoreChange={setPlayerScore}
              />
              <View style={styles.vsContainer}>
                <ThemedText variant="caption" muted style={styles.vs}>VS</ThemedText>
              </View>
              <ScoreCounter
                label="Team B"
                score={opponentScore}
                onIncrement={() => setOpponentScore((v) => v + 1)}
                onDecrement={() => setOpponentScore((v) => Math.max(0, v - 1))}
                onScoreChange={setOpponentScore}
              />
            </View>
          </View>

          {/* Visibility */}
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionLabel}>Visibility</ThemedText>
            <PrivacyToggle isPublic={isPublic} onChange={setIsPublic} />
          </View>
        </ScrollView>

        {/* Footer Save Button */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button
            label={saving ? 'Saving...' : 'Save Match'}
            disabled={!canSave || saving}
            onPress={handleSave}
            variant="primary"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  headerAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center', flex: 1, fontWeight: '700' },
  saveAction: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveLabel: { fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.35 },
  pressed: { opacity: 0.6 },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.lg,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  scores: { gap: Spacing.md, alignItems: 'center' },
  vsContainer: {
    marginVertical: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vs: { fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
});