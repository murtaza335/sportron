import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { MatchLineupSelector } from '@/components/MatchLineupSelector';
import { ScoreCounter } from '@/components/ScoreCounter';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { recordCommunityMatch, searchCommunityMembers } from '@/services/communities';
import type { MatchFormat, Profile, Sport } from '@/types';
import { DEFAULT_NOTIFICATION_PREFERENCES, isRacketSport, isTeamSport } from '@/types';

type SelectionState = {
  playerPartner: Profile | null;
  opponent: Profile | null;
  opponentPartner: Profile | null;
};

export default function AddMatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { communityId, sport: sportParam } = useLocalSearchParams<{ communityId?: string; sport?: Sport }>();
  const { user, profile } = useAuth();

  const [sport] = useState<Sport>(sportParam ?? 'table_tennis');
  const [customSportName] = useState('');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
  const [matchFormat, setMatchFormat] = useState<MatchFormat>('singles');
  const [selection, setSelection] = useState<SelectionState>({
    playerPartner: null,
    opponent: null,
    opponentPartner: null,
  });
  const [playerScore, setPlayerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [saving, setSaving] = useState(false);

  // Search community members by username — only called once the user stops
  // typing (debounced in MatchLineupSelector) and at least 1 char is entered.
  const searchProfiles = useCallback(
    async (query: string): Promise<Profile[]> => {
      if (!communityId) return [];
      const members = await searchCommunityMembers(communityId, query);
      return members
        .filter((m) => m.profile_id !== user?.id && Boolean(m.profile))
        .map((m) => ({
          id: m.profile_id,
          username: m.profile?.username ?? '',
          display_name: m.profile?.display_name ?? null,
          bio: null,
          role: 'student' as const,
          avatar_url: m.profile?.avatar_url ?? null,
          fcm_tokens: [],
          notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
          deleted_at: null,
          created_at: '',
          updated_at: '',
        }));
    },
    [communityId, user?.id],
  );

  const isRacket = isRacketSport(sport);
  const isTeam = isTeamSport(sport);

  const canSave =
    (sport === 'other' ? customSportName.trim().length > 0 : true) &&
    (isRacket
      ? (matchFormat === 'singles'
          ? selection.opponent !== null
          : selection.playerPartner !== null &&
            selection.opponent !== null &&
            selection.opponentPartner !== null)
      : isTeam
        ? selection.opponent !== null && teamAName.trim().length > 0 && teamBName.trim().length > 0
        : true) &&
    (playerScore > 0 || opponentScore > 0);

  const handleSave = async () => {
    if (!user?.id || !canSave) return;
    if (!communityId) {
      Alert.alert('Error', 'Matches can only be recorded within a community.');
      return;
    }
    setSaving(true);
    try {
      const opponent = selection.opponent;
      if (!opponent) {
        Alert.alert('Invalid Opponent', 'Please select a community member as opponent.');
        setSaving(false);
        return;
      }
      await recordCommunityMatch({
        community_id: communityId,
        recorded_by: user.id,
        player_id: user.id,
        opponent_id: opponent.id,
        sport,
        custom_sport_name: sport === 'other' ? customSportName.trim() : null,
        team_a_name: isTeam ? teamAName.trim() : null,
        team_b_name: isTeam ? teamBName.trim() : null,
        player_score: playerScore,
        opponent_score: opponentScore,
      });
      Alert.alert('Match Recorded', 'Waiting for opponent approval.');
      router.back();
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Could not save match');
    } finally {
      setSaving(false);
    }
  };

return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.headerAction}>
          <X size={24} color={theme.text} strokeWidth={2} />
        </Pressable>
        <ThemedText variant="heading" style={styles.title}>Record Match</ThemedText>
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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        enabled>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* Team names for team sports */}
          {isTeam && (
            <>
              <View style={styles.section}>
                <ThemedText variant="label" muted style={styles.sectionLabel}>Team A Name</ThemedText>
                <View style={[styles.textInput, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                  <TextInput
                    value={teamAName}
                    onChangeText={setTeamAName}
                    placeholder="e.g. CSE Department"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.textInputField, { color: theme.text }]}
                  />
                </View>
              </View>
              <View style={styles.section}>
                <ThemedText variant="label" muted style={styles.sectionLabel}>Team B Name</ThemedText>
                <View style={[styles.textInput, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                  <TextInput
                    value={teamBName}
                    onChangeText={setTeamBName}
                    placeholder="e.g. EE Department"
                    placeholderTextColor={theme.textSecondary}
                    style={[styles.textInputField, { color: theme.text }]}
                  />
                </View>
              </View>

              {/* Opponent Captain / Representative */}
              <View style={styles.section}>
                <ThemedText variant="label" muted style={styles.sectionLabel}>Opponent Captain</ThemedText>
                <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs, marginBottom: Spacing.xs }}>
                  Select the captain or representative of the opposing team.
                </ThemedText>
                <MatchLineupSelector
                  searchProfiles={searchProfiles}
                  currentUserName={profile?.username ?? 'You'}
                  currentUserAvatar={profile?.avatar_url}
                  format="singles"
                  selection={{ playerPartner: null, opponent: selection.opponent, opponentPartner: null }}
                  onChange={(_slot, selectedProfile) =>
                    setSelection((current) => ({ ...current, opponent: selectedProfile }))
                  }
                />
              </View>
            </>
          )}

          {/* Format Selector (racket sports only) */}
          {isRacket && (
            <>
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
                <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs, marginBottom: Spacing.xs }}>
                  Opponent list is limited to community members.
                </ThemedText>
                <MatchLineupSelector
                  searchProfiles={searchProfiles}
                  currentUserName={profile?.username ?? 'You'}
                  currentUserAvatar={profile?.avatar_url}
                  format={matchFormat}
                  selection={selection}
                  onChange={(slot, selectedProfile) =>
                    setSelection((current) => ({ ...current, [slot]: selectedProfile }))
                  }
                />
              </View>
            </>
          )}

          {/* Score Input */}
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionLabel}>Scores</ThemedText>
            <View style={styles.scores}>
              <ScoreCounter
                label={isTeam ? teamAName || 'Team A' : 'Team A'}
                score={playerScore}
                onIncrement={() => setPlayerScore((v) => v + 1)}
                onDecrement={() => setPlayerScore((v) => Math.max(0, v - 1))}
                onScoreChange={setPlayerScore}
              />
              <View style={styles.vsContainer}>
                <ThemedText variant="caption" muted style={styles.vs}>VS</ThemedText>
              </View>
              <ScoreCounter
                label={isTeam ? teamBName || 'Team B' : 'Team B'}
                score={opponentScore}
                onIncrement={() => setOpponentScore((v) => v + 1)}
                onDecrement={() => setOpponentScore((v) => Math.max(0, v - 1))}
                onScoreChange={setOpponentScore}
              />
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer Save Button */}
      <View style={[styles.footer, { borderTopColor: theme.border, paddingBottom: Math.max(Spacing.md, insets.bottom) }]}>
        <Button
          label={saving ? 'Saving...' : 'Submit Match'}
          disabled={!canSave || saving}
          onPress={handleSave}
          variant="primary"
        />
      </View>
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
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  textInputField: {
    fontSize: 16,
    fontWeight: '500',
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