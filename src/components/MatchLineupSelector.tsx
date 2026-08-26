import { Check, Search, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { MatchFormat, Profile } from '@/types';
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type TeamSlot = 'playerPartner' | 'opponent' | 'opponentPartner';

type LineupSelection = {
  playerPartner: Profile | null;
  opponent: Profile | null;
  opponentPartner: Profile | null;
};

type MatchLineupSelectorProps = {
  searchProfiles: (query: string) => Promise<Profile[]>;
  currentUserName: string;
  currentUserAvatar?: string | null;
  format: MatchFormat;
  selection: LineupSelection;
  onChange: (slot: TeamSlot, profile: Profile | null) => void;
};

type SlotCardProps = {
  label: string;
  profile: Profile | null;
  helperText: string;
  onPress?: () => void;
  onDelete?: () => void;
  locked?: boolean;
};

function SlotCard({
  label,
  profile,
  helperText,
  onPress,
  onDelete,
  locked = false,
}: SlotCardProps) {
  const theme = useTheme();

  const content = profile ? (
    <>
      <UserAvatar avatarUrl={profile.avatar_url} size={64} />
      <ThemedText variant="body" style={styles.slotName} numberOfLines={1}>
        {profile.username}
      </ThemedText>
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
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.6 }]}
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
  searchProfiles,
  currentUserName,
  currentUserAvatar,
  format,
  selection,
  onChange,
}: MatchLineupSelectorProps) {
  const theme = useTheme();
  const SEARCH_DEBOUNCE_MS = 300;
  const [activeSlot, setActiveSlot] = useState<TeamSlot | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryRef = useRef('');
  // Drag-to-dismiss: offset grows as the user pulls the sheet down.
  const [sheetTranslate] = useState(() => new Animated.Value(0));

  const selectedIds = useMemo(() => {
    return new Set(
      [selection.playerPartner?.id, selection.opponent?.id, selection.opponentPartner?.id].filter(
        Boolean,
      ) as string[],
    );
  }, [selection.playerPartner?.id, selection.opponent?.id, selection.opponentPartner?.id]);

  const normalizedQuery = query.trim();

  // Debounced username search — only fires once the user stops typing, and
  // only when at least one character has been entered.
  const handleQueryChange = (text: string) => {
    setQuery(text);
    queryRef.current = text;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 1) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchProfiles(text.trim());
        if (queryRef.current.trim() === text.trim()) {
          setResults(data);
        }
      } catch (e) {
        console.error('Failed to search community members:', e);
        if (queryRef.current.trim() === text.trim()) {
          setResults([]);
        }
      } finally {
        if (queryRef.current.trim() === text.trim()) {
          setSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);
  };

  // Clear any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const visibleProfiles = useMemo<Profile[]>(() => {
    const activeSelection = activeSlot ? selection[activeSlot] : null;
    return results.filter((profile) => {
      if (selectedIds.has(profile.id) && activeSelection?.id !== profile.id) {
        return false;
      }
      return true;
    });
  }, [activeSlot, results, selectedIds, selection]);

  const closePicker = useCallback(() => {
    setActiveSlot(null);
    setQuery('');
    setResults([]);
    setSearching(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  // Drag-to-dismiss: pulling the sheet down translates it, releasing past a
  // threshold (or with enough velocity) animates it off-screen and closes.
  const panResponder = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  const [panHandlers, setPanHandlers] =
    useState<ReturnType<typeof PanResponder.create>['panHandlers'] | null>(null);

  useEffect(() => {
    if (!panResponder.current) {
      panResponder.current = PanResponder.create({
        onMoveShouldSetPanResponder: (_e, gs) =>
          Math.abs(gs.dy) > 6 && Math.abs(gs.dy) > Math.abs(gs.dx),
        onPanResponderMove: (_e, gs) => {
          if (gs.dy > 0) sheetTranslate.setValue(gs.dy);
        },
        onPanResponderRelease: (_e, gs) => {
          if (gs.dy > 140 || gs.vy > 0.6) {
            Animated.timing(sheetTranslate, {
              toValue: SCREEN_HEIGHT,
              duration: 200,
              useNativeDriver: true,
            }).start(closePicker);
          } else {
            Animated.spring(sheetTranslate, {
              toValue: 0,
              tension: 50,
              friction: 8,
              useNativeDriver: true,
            }).start();
          }
        },
      });
      setPanHandlers(panResponder.current.panHandlers);
    }
  }, [sheetTranslate, closePicker]);

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
                display_name: null,
                bio: null,
                avatar_url: currentUserAvatar ?? null,
                fcm_tokens: [],
                notification_preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
                deleted_at: null,
                created_at: '',
                updated_at: '',
                streak_count: 0,
                longest_streak: 0,
                last_activity_date: null,
                streak_updated_at: null,
              }}
              helperText=""
              locked
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

      <Modal animationType="none" transparent visible={activeSlot !== null} onRequestClose={closePicker}>
        <View style={styles.modalBackdrop}>
          <Animated.View
            style={[
              styles.sheet,
              {
                backgroundColor: theme.background,
                transform: [{ translateY: sheetTranslate }],
              },
            ]}>
            <View style={styles.handleContainer} {...panHandlers}>
              <View style={[styles.handle, { backgroundColor: theme.border }]} />
            </View>
            <View style={styles.sheetHeader} {...panHandlers}>
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

              <Pressable onPress={closePicker} hitSlop={12} style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}>
                <X size={20} color={theme.text} />
              </Pressable>
            </View>

            <View style={[styles.searchRow, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <Search size={18} color={theme.textSecondary} />
              <TextInput
                value={query}
                onChangeText={handleQueryChange}
                placeholder="Search players by username"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searching && <ActivityIndicator size="small" color={theme.textSecondary} />}
            </View>

            {normalizedQuery.length >= 1 && searching && visibleProfiles.length > 0 && (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={theme.textSecondary} />
              </View>
            )}

            <FlatList
              data={visibleProfiles}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              style={styles.listFlex}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const isSelected = activeSlot ? selection[activeSlot]?.id === item.id : false;

                return (
                  <Pressable
                    onPress={() => {
                      if (!activeSlot) return;
                      onChange(activeSlot, item);
                      closePicker();
                    }}
                    style={({ pressed }) => [
                      styles.playerRow,
                      { borderColor: theme.border, backgroundColor: theme.background },
                      pressed && styles.pressed,
                      isSelected && { backgroundColor: theme.backgroundElement },
                    ]}>
                    <UserAvatar avatarUrl={item.avatar_url} size={48} />
                    <View style={styles.playerMeta}>
                      <ThemedText variant="body" style={styles.playerName}>
                        {item.username}
                      </ThemedText>
                      {item.display_name ? (
                        <ThemedText variant="caption" muted>
                          {item.display_name}
                        </ThemedText>
                      ) : null}
                    </View>
                    {isSelected && <Check size={18} color={theme.text} />}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                normalizedQuery.length < 1 ? (
                  <ThemedText variant="caption" muted style={styles.empty}>
                    Type at least 1 character to search players.
                  </ThemedText>
                ) : searching ? (
                  <View style={styles.searchingRow}>
                    <ActivityIndicator size="small" color={theme.textSecondary} />
                  </View>
                ) : (
                  <ThemedText variant="caption" muted style={styles.empty}>
                    No players found.
                  </ThemedText>
                )
              }
            />
          </Animated.View>
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
    height: '100%',
    width: '100%',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  handleContainer: {
    width: '100%',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: Radius.full,
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
  listFlex: {
    flex: 1,
  },
  searchingRow: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
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