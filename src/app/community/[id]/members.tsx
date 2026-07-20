import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { X } from 'lucide-react-native';

import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import {
  fetchCommunityMembers,
  removeMember,
} from '@/services/communities';
import type { CommunityMember } from '@/types';

export default function CommunityMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const isAdmin = members.some(
    (m) => m.profile_id === user?.id && m.role === 'admin',
  );

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchCommunityMembers(id);
      setMembers(data);
    } catch (e) {
      console.error('Failed to load members:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRemove = (member: CommunityMember) => {
    Alert.alert(
      'Remove Member',
      `Remove this member from the community?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeMember(id!, member.profile_id);
              setMembers((prev) => prev.filter((m) => m.profile_id !== member.profile_id));
            } catch (e: any) {
              Alert.alert('Error', e?.message ?? 'Failed to remove member.');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Members' }} />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.profile_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.text}
            />
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.memberCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}
            >
              <View style={styles.memberInfo}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: item.role === 'admin' ? '#D97706' : theme.textSecondary },
                  ]}
                >
                  <ThemedText style={[styles.avatarText, { color: '#fff' }]}>
                    {(item.profile?.username ?? '?').charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
                <View>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {item.profile_id === user?.id
                      ? 'You'
                      : item.profile?.username ?? item.profile_id.slice(0, 8)}
                  </ThemedText>
                  {isAdmin && item.profile?.display_name && item.profile_id !== user?.id && (
                    <ThemedText variant="caption" muted>
                      {item.profile.display_name}
                    </ThemedText>
                  )}
                  <View style={styles.roleRow}>
                    {item.role === 'admin' && (
                      <ThemedText
                        variant="caption"
                        style={{ color: '#D97706', fontWeight: '700', fontSize: 10 }}
                      >
                        Admin
                      </ThemedText>
                    )}
                    {item.profile_id === user?.id && item.role === 'member' && (
                      <ThemedText variant="caption" muted style={{ fontSize: 10 }}>
                        You
                      </ThemedText>
                    )}
                  </View>
                </View>
              </View>
              {isAdmin && item.profile_id !== user?.id && (
                <Pressable
                  onPress={() => handleRemove(item)}
                  hitSlop={12}
                  style={[styles.removeBtn, { backgroundColor: '#DC262615' }]}
                >
                  <X size={14} color="#DC2626" strokeWidth={3} />
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <ThemedText variant="caption" muted style={styles.empty}>
              No members found.
            </ThemedText>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: {
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '800' },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { textAlign: 'center', paddingVertical: Spacing.xxl },
});
