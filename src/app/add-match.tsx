import { useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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

  const loadProfiles = useCallback(async () => {
    try {
      const data = await fetchAllProfiles(user?.id);
      setProfiles(data);
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  }, [user?.id]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  const canSave =
    (matchFormat === 'singles'
      ? selection.opponent !== null
      : selection.playerPartner !== null &&
        selection.opponent !== null &&
        selection.opponentPartner !== null) &&
    (playerScore > 0 || opponentScore > 0);

  const handleSave = async () => {
    if (!user?.id || !canSave) {
      return;
    }

    setSaving(true);
    try {
      await createMatch(user.id, {
        matchFormat,
        playerPartnerId: selection.playerPartner?.id ?? null,
        opponentId: selection.opponent?.id ?? null,
        opponentPartnerId: selection.opponentPartner?.id ?? null,
        opponentGuestName: null,
        playerScore,
        opponentScore,
        isPublic,
      });
      router.back();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save match';
      Alert.alert('Save failed', message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerAction}>
            <X size={24} color={theme.text} strokeWidth={2.2} />
            <ThemedText variant="caption" style={styles.headerActionLabel}>
              Cancel
            </ThemedText>
          </Pressable>

          <ThemedText variant="heading">New match</ThemedText>

          <Pressable
            onPress={handleSave}
            hitSlop={12}
            disabled={!canSave || saving}
            style={({ pressed }) => [
              styles.saveAction,
              (!canSave || saving) && styles.disabled,
              pressed && canSave && !saving && styles.pressed,
            ]}>
            <ThemedText variant="caption" style={styles.saveLabel}>
              {saving ? 'Saving...' : 'Save'}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled">
          <SegmentedControl
            options={[
              { value: 'singles', label: 'Singles' },
              { value: 'doubles', label: 'Doubles' },
            ]}
            value={matchFormat}
            onChange={setMatchFormat}
          />

          <MatchLineupSelector
            profiles={profiles}
            currentUserName={profile?.display_name ?? 'You'}
            format={matchFormat}
            selection={selection}
            onChange={(slot, selectedProfile) =>
              setSelection((currentSelection) => ({
                ...currentSelection,
                [slot]: selectedProfile,
              }))
            }
          />

          <View style={styles.section}>
            <ThemedText variant="label" muted>
              Visibility
            </ThemedText>
            <PrivacyToggle isPublic={isPublic} onChange={setIsPublic} />
          </View>

          <View style={styles.section}>
            <ThemedText variant="label" muted>
              Score input
            </ThemedText>

            <View style={styles.scores}>
              <ScoreCounter
                label="Team A"
                score={playerScore}
                onIncrement={() => setPlayerScore((value) => value + 1)}
                onDecrement={() => setPlayerScore((value) => Math.max(0, value - 1))}
              />
              <ThemedText variant="hero" muted style={styles.vs}>
                vs
              </ThemedText>
              <ScoreCounter
                label="Team B"
                score={opponentScore}
                onIncrement={() => setOpponentScore((value) => value + 1)}
                onDecrement={() => setOpponentScore((value) => Math.max(0, value - 1))}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
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
  headerAction: {
    minWidth: 64,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  headerActionLabel: {
    fontWeight: '700',
  },
  saveAction: {
    minWidth: 64,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveLabel: {
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.35,
  },
  pressed: {
    opacity: 0.6,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.xl,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  section: {
    gap: Spacing.md,
  },
  scores: {
    gap: Spacing.lg,
  },
  vs: {
    textAlign: 'center',
    fontSize: 20,
    lineHeight: 24,
  },
});
