import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Check, ChevronLeft, UserPlus, X } from 'lucide-react-native';

import { alert } from '@/lib/alert';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { UserAvatar } from '@/components/UserAvatar';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { fetchJoinRequests, respondToJoinRequest } from '@/services/communities';
import type { CommunityJoinRequest } from '@/types';

export default function CommunityJoinRequestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [joinRequests, setJoinRequests] = useState<CommunityJoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchJoinRequests(id);
      setJoinRequests(data);
    } catch (e) {
      console.error('Failed to load join requests:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!id) return;

    const channel = supabase
      .channel(`join-requests-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_join_requests',
          filter: `community_id=eq.${id}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleRespond = async (
    request: CommunityJoinRequest,
    status: 'approved' | 'rejected',
  ) => {
    if (processingId) return;
    setProcessingId(request.id);
    try {
      await respondToJoinRequest(request.id, status);
      setJoinRequests((prev) => prev.filter((r) => r.id !== request.id));
    } catch (e: any) {
      alert('Error', e?.message ?? 'Failed to respond.');
    } finally {
      setProcessingId(null);
    }
  };

  const themedHeader = {
    headerStyle: { backgroundColor: theme.background },
    headerShadowVisible: false,
    headerTintColor: theme.text,
    headerTitleStyle: { color: theme.text },
    headerLeft: () => (
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [
          { marginRight: 8, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
          pressed && { backgroundColor: theme.backgroundSelected, transform: [{ scale: 0.92 }] },
        ]}
      >
        <ChevronLeft size={24} color={theme.text} />
      </Pressable>
    ),
  };

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Join Requests', ...themedHeader }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.text} />
        }
      >
        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : joinRequests.length === 0 ? (
          <View style={styles.empty}>
            <UserPlus size={40} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="body" muted style={{ fontWeight: '600' }}>
              No pending requests
            </ThemedText>
            <ThemedText variant="caption" muted style={{ textAlign: 'center' }}>
              When someone requests to join this community, they&apos;ll show up here
            </ThemedText>
          </View>
        ) : (
          joinRequests.map((req) => (
            <Card key={req.id} style={styles.requestCard}>
              <View style={styles.requestInfo}>
                <UserAvatar avatarUrl={req.profile?.avatar_url} size={36} />
                <View style={styles.memberInfo}>
                  <ThemedText variant="body" style={{ fontWeight: '600' }}>
                    {req.profile?.username ?? 'Unknown'}
                  </ThemedText>
                  <ThemedText variant="caption" muted numberOfLines={1}>
                    wants to join this community
                  </ThemedText>
                </View>
              </View>
              <View style={styles.requestActions}>
                {processingId === req.id ? (
                  <View style={[styles.actionChip, { backgroundColor: '#10B98120', borderColor: '#10B98140' }]}>
                    <ActivityIndicator size="small" color="#10B981" />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleRespond(req, 'approved')}
                    style={({ pressed }) => [
                      styles.actionChip,
                      { backgroundColor: '#10B98120', borderColor: '#10B98140' },
                      pressed && { opacity: 0.6, transform: [{ scale: 0.9 }] },
                    ]}
                    hitSlop={8}
                  >
                    <Check size={14} color="#10B981" strokeWidth={3} />
                  </Pressable>
                )}
                {processingId === req.id ? (
                  <View style={[styles.actionChip, { backgroundColor: '#EF444420', borderColor: '#EF444440' }]}>
                    <ActivityIndicator size="small" color="#EF4444" />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handleRespond(req, 'rejected')}
                    style={({ pressed }) => [
                      styles.actionChip,
                      { backgroundColor: '#EF444420', borderColor: '#EF444440' },
                      pressed && { opacity: 0.6, transform: [{ scale: 0.9 }] },
                    ]}
                    hitSlop={8}
                  >
                    <X size={14} color="#EF4444" strokeWidth={3} />
                  </Pressable>
                )}
              </View>
            </Card>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    paddingBottom: Spacing.xxxl,
  },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxxl,
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  requestInfo: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flex: 1 },
  memberInfo: { flex: 1, gap: 2 },
  requestActions: { flexDirection: 'row', gap: Spacing.xs },
  actionChip: {
    width: 32,
    height: 32,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
