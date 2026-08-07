import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, UserCheck, UserPlus, X } from 'lucide-react-native';

import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchAllProfiles } from '@/services/profiles';
import { fetchJoinRequests, fetchPendingInvites, inviteMemberByUsername } from '@/services/communities';
import type { Profile } from '@/types';

interface InviteMemberModalProps {
  communityId: string;
  adminId: string;
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function InviteMemberModal({
  communityId,
  adminId,
  visible,
  onClose,
  onSuccess,
}: InviteMemberModalProps) {
  const theme = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());
  const [pendingRequestIds, setPendingRequestIds] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPendingState = useCallback(async () => {
    try {
      const [invites, joinRequests] = await Promise.all([
        fetchPendingInvites(communityId),
        fetchJoinRequests(communityId),
      ]);
      setInvitedIds(new Set(invites.map((i) => i.invitee_id)));
      setPendingRequestIds(new Set(joinRequests.map((r) => r.user_id)));
    } catch (err) {
      console.error('Failed to load pending invites:', err);
    }
  }, [communityId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (visible) {
        loadPendingState();
      } else {
        setInvitedIds(new Set());
        setPendingRequestIds(new Set());
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, loadPendingState]);

  const loadProfiles = useCallback(async (query: string) => {
    if (!query.trim()) {
      setProfiles([]);
      return;
    }
    try {
      const data = await fetchAllProfiles(adminId);
      return data;
    } catch (err) {
      console.error('Failed to load profiles:', err);
      throw err;
    }
  }, [adminId]);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  // Fetch profiles when debounced query changes (only if not empty)
  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      if (!debouncedSearchQuery.trim()) {
        setProfiles([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = (await loadProfiles(debouncedSearchQuery)) ?? [];
        if (!cancelled) setProfiles(data);
      } catch {
        if (!cancelled) setError('Failed to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [debouncedSearchQuery, loadProfiles]);

  // Derive filtered profiles using debounced query
  const filteredProfiles = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return [];
    const query = debouncedSearchQuery.toLowerCase();
    return profiles.filter(
      (p) =>
        p.username.toLowerCase().includes(query) ||
        p.display_name?.toLowerCase().includes(query),
    );
  }, [debouncedSearchQuery, profiles]);

  const handleInvite = async (profile: Profile) => {
    setInviting(profile.username);
    setError(null);
    try {
      await inviteMemberByUsername(communityId, adminId, profile.username);
      setInvitedIds((prev) => new Set(prev).add(profile.id));
      Alert.alert('Invite Sent', `Invitation sent to @${profile.username}`);
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Invite failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setInviting(null);
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background, flex: 1 }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 100}
          enabled
        >
          <View style={styles.header}>
            <Pressable onPress={onClose} hitSlop={16} style={styles.headerAction}>
              <X size={24} color={theme.text} strokeWidth={2} />
            </Pressable>
            <ThemedText variant="heading" style={styles.title}>Invite Member</ThemedText>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {error && (
              <View style={styles.error}>
                <ThemedText variant="body" style={{ color: '#DC2626', fontWeight: '600' }}>
                  {error}
                </ThemedText>
              </View>
            )}

            <View style={styles.searchField}>
              <ThemedText variant="label" muted style={styles.label}>Search by Username</ThemedText>
              <View style={[{ backgroundColor: theme.backgroundElement, borderColor: theme.border }, styles.searchInput]}>
                <Search size={20} color={theme.textSecondary} style={styles.searchIcon} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Enter username (without @)"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.textInputField, { color: theme.text }]}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {loading ? (
              <View style={styles.centered}>
                <ThemedText variant="body" muted>Loading...</ThemedText>
              </View>
            ) : debouncedSearchQuery.trim() ? (
              filteredProfiles.length === 0 ? (
                <View style={styles.empty}>
                  <ThemedText variant="body" muted style={{ fontWeight: '600' }}>
                    No users found
                  </ThemedText>
                  <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
                    Try a different username
                  </ThemedText>
                </View>
              ) : (
                filteredProfiles.map((profile) => {
                  const isInvited = invitedIds.has(profile.id);
                  const isPendingRequest = pendingRequestIds.has(profile.id);
                  const isDisabled = isInvited || isPendingRequest;
                  return (
                    <Pressable
                      key={profile.id}
                      onPress={() => handleInvite(profile)}
                      disabled={inviting === profile.username || isDisabled}
                      style={({ pressed }) => [
                        styles.userRow,
                        {
                          backgroundColor: pressed
                            ? theme.backgroundSelected
                            : theme.backgroundElement,
                          opacity: isDisabled ? 0.55 : 1,
                        },
                      ]}
                      hitSlop={8}
                    >
                      <View style={styles.userInfo}>
                        <ThemedText variant="body" style={{ fontWeight: '600', color: theme.text }}>
                          @{profile.username}
                        </ThemedText>
                        {profile.display_name && (
                          <ThemedText variant="caption" muted style={{ marginTop: 2 }}>
                            {profile.display_name}
                          </ThemedText>
                        )}
                      </View>
                      {inviting === profile.username ? (
                        <ThemedText variant="caption" style={{ fontWeight: '600', color: '#3B82F6' }}>
                          Sending...
                        </ThemedText>
                      ) : isInvited ? (
                        <View style={styles.invitedBadge}>
                          <UserCheck size={16} color={theme.textSecondary} strokeWidth={2.2} />
                          <ThemedText variant="caption" muted style={{ fontWeight: '700', fontSize: 13 }}>
                            Invited
                          </ThemedText>
                        </View>
                      ) : isPendingRequest ? (
                        <View style={styles.invitedBadge}>
                          <UserCheck size={16} color={theme.textSecondary} strokeWidth={2.2} />
                          <ThemedText variant="caption" muted style={{ fontWeight: '700', fontSize: 13 }}>
                            Pending
                          </ThemedText>
                        </View>
                      ) : (
                        <UserPlus size={20} color={theme.text} strokeWidth={2.2} />
                      )}
                    </Pressable>
                  );
                })
              )
            ) : (
              <View style={styles.empty}>
                <ThemedText variant="body" muted style={{ fontWeight: '600' }}>
                  Enter a username to search
                </ThemedText>
                <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
                  Type at least 1 character to find users
                </ThemedText>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    gap: Spacing.lg,
  },
  searchField: {
    gap: Spacing.sm,
  },
  label: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchIcon: { marginRight: Spacing.xs },
  textInputField: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  userInfo: { flex: 1 },
  invitedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxxl,
  },
  error: {
    padding: Spacing.md,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: Radius.md,
  },
});