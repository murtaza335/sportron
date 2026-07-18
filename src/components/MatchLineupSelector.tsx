import { Check, Search, Trash2, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MatchFormat, Profile, UserRole, GuestProfile } from '@/types';

type TeamSlot = 'playerPartner' | 'opponent' | 'opponentPartner';

type LineupSelection = {
  playerPartner: Profile | GuestProfile | null;
  opponent: Profile | GuestProfile | null;
  opponentPartner: Profile | GuestProfile | null;
};

type MatchLineupSelectorProps = {
  profiles: Profile[];
  currentUserName: string;
  format: MatchFormat;
  selection: LineupSelection;
  onChange: (slot: TeamSlot, profile: Profile | GuestProfile | null) => void;
};

type SlotCardProps = {
  label: string;
  profile: Profile | GuestProfile | null;
  helperText: string;
  onPress?: () => void;
  onDelete?: () => void;
  locked?: boolean;
  showRole?: boolean;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function SlotCard({
  label,
  profile,
  helperText,
  onPress,
  onDelete,
  locked = false,
  showRole = true,
}: SlotCardProps) {
  const theme = useTheme();

  const content = profile ? (
    <>
      <View style={[styles.avatar, { backgroundColor: theme.text }]}>
        <ThemedText variant="caption" style={{ color: theme.background, fontWeight: '800' }}>
          {getInitials(profile.username) || '?'}
        </ThemedText>
      </View>
      <ThemedText variant="body" style={styles.slotName} numberOfLines={1}>
        {profile.username}
      </ThemedText>
      {showRole ? (
        <ThemedText variant="caption" muted>
          {profile.role}
        </ThemedText>
      ) : null}
    </>
  ) : (
    <>
      <View style={[styles.avatar, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText variant="heading" muted style={styles.plus}>
          +
        </ThemedText>
      </View>
      <ThemedText variant="body" style={styles.slotName}>
        Add player
      </ThemedText>
      {/* <ThemedText variant="caption" muted>
        Tap to choose
      </ThemedText> */}
    </>
  );

  const card = (
    <View
      style={[
        styles.slotCard,
        {
          borderColor: theme.border,
          backgroundColor: locked ? theme.backgroundElement : theme.background,
        },
      ]}>
      <ThemedText variant="caption" muted style={styles.slotLabel}>
        {label}
      </ThemedText>
      {profile && onDelete && (
        <Pressable
          onPress={onDelete}
          hitSlop={12}
          style={styles.deleteButton}
        >
          <Trash2 size={16} color="#DC2626" />
        </Pressable>
      )}
      {content}
      <ThemedText variant="caption" muted style={styles.helperText}>
        {helperText}
      </ThemedText>
    </View>
  );

  if (!onPress) {
    return card;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.slotPressable, pressed && styles.pressed]}>
      {card}
    </Pressable>
  );
}

export function MatchLineupSelector({
  profiles,
  currentUserName,
  format,
  selection,
  onChange,
}: MatchLineupSelectorProps) {
  const theme = useTheme();
  const [activeSlot, setActiveSlot] = useState<TeamSlot | null>(null);
  const [query, setQuery] = useState('');

  const selectedIds = useMemo(() => {
    return new Set(
      [selection.playerPartner?.id, selection.opponent?.id, selection.opponentPartner?.id].filter(
        Boolean,
      ) as string[],
    );
  }, [selection.playerPartner?.id, selection.opponent?.id, selection.opponentPartner?.id]);

  const availableProfiles = useMemo<(Profile | GuestProfile)[]>(() => {
    const normalized = query.trim().toLowerCase();
    const activeSelection = activeSlot ? selection[activeSlot] : null;

    const filtered = profiles.filter((profile) => {
      if (selectedIds.has(profile.id) && activeSelection?.id !== profile.id) {
        return false;
      }

      if (!normalized) {
        return true;
      }

      return profile.username.toLowerCase().includes(normalized);
    });

    // Add "Guest" option for partner and opponent slots
    if (activeSlot === 'playerPartner' || activeSlot === 'opponent' || activeSlot === 'opponentPartner') {
      const guestProfile: GuestProfile = {
        id: `guest-${activeSlot}`,
        username: 'Guest',
        role: 'student' as UserRole,
        isGuest: true,
        bio: null,
        avatar_url: null,
        fcm_tokens: [],
        notification_preferences: {
          match_pending: true,
          match_approved: true,
          match_rejected: true,
          match_liked: true,
          match_commented: true,
        },
        created_at: '',
        updated_at: '',
      };
      return [
        guestProfile,
        ...filtered,
      ];
    }

    return filtered;
  }, [activeSlot, profiles, query, selectedIds, selection]);

  const closePicker = () => {
    setActiveSlot(null);
    setQuery('');
  };

  const isDoubles = format === 'doubles';

  return (
    <View style={styles.container}>
      <View style={styles.boardHeader}>
        <ThemedText variant="label">Lineup</ThemedText>
        <ThemedText variant="caption" muted>
          {isDoubles ? '2 vs 2' : '1 vs 1'}
        </ThemedText>
      </View>

      <View style={[styles.board, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
        <ThemedText variant="label" style={styles.teamLabel}>
          TEAM A
        </ThemedText>

        <View style={styles.row}>
          <View style={styles.slotWrap}>
            <SlotCard
              label="Player 1 (You)"
              profile={{
                id: 'current-user',
                username: currentUserName,
                bio: null,
                role: 'student',
                avatar_url: null,
                fcm_tokens: [],
                notification_preferences: {
                  match_pending: true,
                  match_approved: true,
                  match_rejected: true,
                  match_liked: true,
                  match_commented: true,
                },
                created_at: '',
                updated_at: '',
              }}
              helperText=""
              locked
              showRole={false}
            />
          </View>

          {isDoubles ? (
            <View style={styles.slotWrap}>
              <SlotCard
                label="Player 2"
                profile={selection.playerPartner}
                helperText=""
                onPress={() => setActiveSlot('playerPartner')}
                onDelete={() => onChange('playerPartner', null)}
              />
            </View>
          ) : null}
        </View>

        <View style={styles.dividerRow}>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <ThemedText variant="caption" muted style={styles.vs}>
            VS
          </ThemedText>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
        </View>

        <ThemedText variant="label" style={styles.teamLabel}>
          TEAM B
        </ThemedText>

        <View style={styles.row}>
          <View style={styles.slotWrap}>
            <SlotCard
              label={isDoubles ? 'Player 3' : 'Player 2'}
              profile={selection.opponent}
              helperText=""
              onPress={() => setActiveSlot('opponent')}
              onDelete={() => onChange('opponent', null)}
            />
          </View>

          {isDoubles ? (
            <View style={styles.slotWrap}>
              <SlotCard
                label="Player 4"
                profile={selection.opponentPartner}
                helperText=""
                onPress={() => setActiveSlot('opponentPartner')}
                onDelete={() => onChange('opponentPartner', null)}
              />
            </View>
          ) : null}
        </View>

        {/* <ThemedText variant="caption" muted style={styles.boardFooter}>
          Select players from your roster. Duplicate picks are blocked automatically.
        </ThemedText> */}
      </View>

      <Modal animationType="slide" transparent visible={activeSlot !== null} onRequestClose={closePicker}>
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />

          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.sheetHeader}>
              <View>
                <ThemedText variant="label">Choose player</ThemedText>
                <ThemedText variant="caption" muted>
                  {activeSlot === 'playerPartner'
                    ? 'Team A partner'
                    : activeSlot === 'opponent'
                      ? 'Team B player'
                      : 'Team B partner'}
                </ThemedText>
              </View>

              <Pressable onPress={closePicker} hitSlop={12} style={styles.closeButton}>
                <X size={20} color={theme.text} />
              </Pressable>
            </View>

            <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <Search size={18} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search players"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </View>

            <FlatList
              data={availableProfiles}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const isGuest = 'isGuest' in item && item.isGuest === true;
                const isSelected = activeSlot ? selection[activeSlot]?.id === item.id : false;

                return (
                  <Pressable
                    onPress={() => {
                      if (!activeSlot) {
                        return;
                      }

                      if (isGuest) {
                        // Pass guest profile directly - one step
                        onChange(activeSlot, item);
                        closePicker();
                      } else {
                        onChange(activeSlot, item);
                        closePicker();
                      }
                    }}
                    style={({ pressed }) => [
                      styles.playerRow,
                      { borderColor: theme.border, backgroundColor: theme.background },
                      pressed && styles.pressed,
                      isSelected && { backgroundColor: theme.backgroundElement },
                    ]}>
                    <View style={[styles.avatarSmall, { backgroundColor: isGuest ? '#6B7280' : theme.text }]}>
                      <ThemedText variant="caption" style={{ color: theme.background, fontWeight: '800' }}>
                        {isGuest ? '+' : (getInitials(item.username) || '?')}
                      </ThemedText>
                    </View>
                    <View style={styles.playerMeta}>
                      <ThemedText variant="body" style={styles.playerName}>
                        {item.username}
                      </ThemedText>
                      <ThemedText variant="caption" muted>
                        {isGuest ? 'Add unregistered player' : item.role}
                      </ThemedText>
                    </View>
                    {isSelected && !isGuest && <Check size={18} color={theme.text} />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <ThemedText variant="caption" muted style={styles.empty}>
                  No available players found.
                </ThemedText>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  boardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  board: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.md,
  },
  teamLabel: {
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  slotWrap: {
    flex: 1,
  },
  slotPressable: {
    flex: 1,
  },
  slotCard: {
    minHeight: 144,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  slotLabel: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.sm,
  },
  deleteButton: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 10,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmall: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  slotName: {
    textAlign: 'center',
    fontWeight: '700',
  },
  helperText: {
    position: 'absolute',
    bottom: Spacing.sm,
  },
  plus: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  divider: {
    flex: 1,
    height: 1,
  },
  vs: {
    letterSpacing: 1.2,
  },
  boardFooter: {
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    borderTopWidth: 1,
    padding: Spacing.lg,
    maxHeight: '82%',
    gap: Spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: Spacing.xs,
  },
  list: {
    gap: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  playerMeta: {
    flex: 1,
    gap: 2,
  },
  playerName: {
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.xl,
  },
  pressed: {
    opacity: 0.75,
  },
});