import { useLocalSearchParams, useRouter } from 'expo-router';
import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { MatchLineupSelector } from '@/components/MatchLineupSelector';
import { PrivacyToggle } from '@/components/PrivacyToggle';
import { ScoreCounter } from '@/components/ScoreCounter';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { createMatch } from '@/services/matches';
import { fetchAllProfiles } from '@/services/profiles';
import { fetchCommunityMembers, recordCommunityMatch } from '@/services/communities';
import type { MatchFormat, Profile, GuestProfile, Sport, CommunityMember } from '@/types';
import { SPORT_LABELS, isRacketSport, isTeamSport } from '@/types';

type SelectionState = {
  playerPartner: Profile | GuestProfile | null;
  opponent: Profile | GuestProfile | null;
  opponentPartner: Profile | GuestProfile | null;
};

export default function AddMatchScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { communityId } = useLocalSearchParams<{ communityId?: string }>();
  const { user, profile } = useAuth();

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [communityMembers, setCommunityMembers] = useState<CommunityMember[]>([]);
  const [sport, setSport] = useState<Sport>('table_tennis');
  const [customSportName, setCustomSportName] = useState('');
  const [teamAName, setTeamAName] = useState('');
  const [teamBName, setTeamBName] = useState('');
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

  const isCommunityMatch = !!communityId;

  // Build community member profiles for the opponent selector
  const communityProfiles: Profile[] = useMemo(
    () =>
      communityMembers
        .filter((m) => m.profile_id !== user?.id)
        .map((m) => ({
          id: m.profile_id,
          username: m.profile?.username ?? 'Unknown',
          display_name: m.profile?.display_name ?? null,
          bio: null,
          role: 'student' as const,
          avatar_url: m.profile?.avatar_url ?? null,
          fcm_tokens: [],
          notification_preferences: {
            match_pending: true,
            match_approved: true,
            match_rejected: true,
            match_liked: true,
            match_commented: true,
          },
          deleted_at: null,
          created_at: '',
          updated_at: '',
        })),
    [communityMembers, user?.id],
  );

  useEffect(() => {
    let cancelled = false;

    if (isCommunityMatch && communityId) {
      fetchCommunityMembers(communityId)
        .then((data) => { if (!cancelled) setCommunityMembers(data); })
        .catch((error) => console.error('Failed to load community members:', error));
      // For community matches, default to singles
      setMatchFormat('singles');
    } else {
      fetchAllProfiles(user?.id)
        .then((data) => { if (!cancelled) setProfiles(data); })
        .catch((error) => console.error('Failed to load profiles:', error));
    }

    return () => { cancelled = true; };
  }, [user?.id, communityId, isCommunityMatch]);

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
    setSaving(true);
    try {
      if (isCommunityMatch && communityId) {
        const opponent = selection.opponent;
        if (!opponent || opponent.id.startsWith('guest-')) {
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
        return;
      }

      const isOpponentGuest = selection.opponent?.id?.startsWith('guest-');
      const isOpponentPartnerGuest = selection.opponentPartner?.id?.startsWith('guest-');
      const isPlayerPartnerGuest = selection.playerPartner?.id?.startsWith('guest-');

      await createMatch(user.id, {
        matchFormat: isRacket ? matchFormat : 'singles',
        sport,
        customSportName: sport === 'other' ? customSportName.trim() : null,
        teamAName: isTeam ? teamAName.trim() : null,
        teamBName: isTeam ? teamBName.trim() : null,
        playerPartnerId: isRacket && !isPlayerPartnerGuest ? selection.playerPartner?.id ?? null : null,
        opponentId: (!isOpponentGuest) ? selection.opponent?.id ?? null : null,
        opponentPartnerId: isRacket && !isOpponentPartnerGuest ? selection.opponentPartner?.id ?? null : null,
        opponentGuestName: (isRacket && (isOpponentGuest || isOpponentPartnerGuest)) ? 'Guest' : null,
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
          <ThemedText variant="heading" style={styles.title}>{isCommunityMatch ? 'Record Match' : 'New Match'}</ThemedText>
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

          {/* Sport Picker */}
          <View style={styles.section}>
            <ThemedText variant="label" muted style={styles.sectionLabel}>Sport</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sportPicker}>
              {(['table_tennis', 'badminton', 'tennis', 'squash', 'pickleball',
                'football', 'cricket', 'volleyball', 'handball', 'basketball',
                'other'] as Sport[]).map((s) => {
                const selected = s === sport;
                return (
                  <Pressable
                    key={s}
                    onPress={() => setSport(s)}
                    style={[
                      styles.sportPill,
                      { borderColor: theme.border },
                      selected && { backgroundColor: theme.text, borderColor: theme.text },
                    ]}
                  >
                    <ThemedText
                      variant="caption"
                      style={[
                        styles.sportPillText,
                        selected && { color: theme.background },
                      ]}
                    >
                      {SPORT_LABELS[s]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Custom sport name for "other" */}
          {sport === 'other' && (
            <View style={styles.section}>
              <ThemedText variant="label" muted style={styles.sectionLabel}>Sport Name</ThemedText>
              <View style={[styles.textInput, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
                <TextInput
                  value={customSportName}
                  onChangeText={setCustomSportName}
                  placeholder="e.g. Ultimate Frisbee"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.textInputField, { color: theme.text }]}
                />
              </View>
            </View>
          )}

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
                {isCommunityMatch && (
                  <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs, marginBottom: Spacing.xs }}>
                    Select the captain or representative of the opposing team.
                  </ThemedText>
                )}
                <MatchLineupSelector
                  profiles={isCommunityMatch ? communityProfiles : profiles}
                  currentUserName={profile?.username ?? 'You'}
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
                {isCommunityMatch && (
                  <ThemedText variant="caption" muted style={{ marginLeft: Spacing.xs, marginBottom: Spacing.xs }}>
                    Opponent list is limited to community members.
                  </ThemedText>
                )}
                <MatchLineupSelector
                  profiles={isCommunityMatch ? communityProfiles : profiles}
                  currentUserName={profile?.username ?? 'You'}
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

          {/* Visibility (hidden for community matches) */}
          {!isCommunityMatch && (
            <View style={styles.section}>
              <ThemedText variant="label" muted style={styles.sectionLabel}>Visibility</ThemedText>
              <PrivacyToggle isPublic={isPublic} onChange={setIsPublic} />
            </View>
          )}
        </ScrollView>

        {/* Footer Save Button */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Button
            label={saving ? 'Saving...' : isCommunityMatch ? 'Submit Match' : 'Save Match'}
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
  sportPicker: {
    flexDirection: 'row',
  },
  sportPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    marginRight: Spacing.sm,
  },
  sportPillText: {
    fontWeight: '700',
    fontSize: 13,
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