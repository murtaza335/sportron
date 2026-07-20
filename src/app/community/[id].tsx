import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fetchCommunityById } from '@/services/communities';
import type { Community } from '@/types';

export default function CommunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let cancelled = false;
      setLoading(true);
      fetchCommunityById(id)
        .then((data) => { if (!cancelled) setCommunity(data); })
        .catch((e) => console.error('Failed to load community:', e))
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }, [id]),
  );

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: community?.name ?? 'Community' }} />
      {loading ? (
        <ActivityIndicator color={theme.text} style={styles.loader} />
      ) : community ? (
        <View style={styles.container}>
          <Card style={styles.headerCard}>
            <ThemedText variant="heading">{community.name}</ThemedText>
            {community.description && (
              <ThemedText variant="body" muted style={styles.description}>
                {community.description}
              </ThemedText>
            )}
            <ThemedText variant="caption" muted>
              {community.member_count ?? 0} member{(community.member_count ?? 0) !== 1 ? 's' : ''}
            </ThemedText>
          </Card>
        </View>
      ) : (
        <ThemedText muted style={styles.loader}>Community not found</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  container: {
    flex: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  headerCard: {
    gap: Spacing.sm,
  },
  description: {
    marginTop: Spacing.xs,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
