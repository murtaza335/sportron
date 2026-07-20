import { useRouter } from 'expo-router';
import { Users } from 'lucide-react-native';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCommunities } from '@/hooks/useCommunities';

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { communities, loading, refreshing, refresh } = useCommunities();

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.text} />
        }
      >
        <ThemedText variant="label" muted style={styles.sectionTitle}>
          Discover Communities
        </ThemedText>

        {loading ? (
          <ActivityIndicator color={theme.text} style={styles.loader} />
        ) : communities.length === 0 ? (
          <View style={styles.empty}>
            <Users size={48} color={theme.textSecondary} strokeWidth={1.5} />
            <ThemedText variant="body" muted style={styles.emptyText}>
              No communities yet
            </ThemedText>
            <ThemedText variant="caption" muted>
              Tap + to create the first one
            </ThemedText>
          </View>
        ) : (
          <View style={styles.grid}>
            {communities.map((community) => (
              <Pressable
                key={community.id}
                onPress={() => router.push(`/community/${community.id}`)}
                style={({ pressed }) => [
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Card style={styles.communityCard}>
                  <View style={styles.avatarCircle}>
                    <ThemedText variant="heading" style={styles.avatarText}>
                      {community.name.charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={styles.communityInfo}>
                    <ThemedText
                      variant="body"
                      style={styles.communityName}
                      numberOfLines={1}
                    >
                      {community.name}
                    </ThemedText>
                    {community.description && (
                      <ThemedText
                        variant="caption"
                        muted
                        numberOfLines={2}
                        style={styles.communityDesc}
                      >
                        {community.description}
                      </ThemedText>
                    )}
                    <View style={styles.metaRow}>
                      <Users size={12} color={theme.textSecondary} strokeWidth={2} />
                      <ThemedText variant="caption" muted>
                        {community.member_count ?? 0}
                      </ThemedText>
                      <View style={[styles.visibilityBadge, { backgroundColor: theme.backgroundSelected }]}>
                        <ThemedText variant="caption" muted style={styles.visibilityText}>
                          {community.visibility === 'public' ? 'Public' : 'Private'}
                        </ThemedText>
                      </View>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginLeft: Spacing.xs,
  },
  grid: {
    gap: Spacing.sm,
  },
  communityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    backgroundColor: 'currentColor',
    opacity: 0.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
  },
  communityInfo: {
    flex: 1,
    gap: 2,
  },
  communityName: {
    fontWeight: '700',
  },
  communityDesc: {
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  visibilityBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  visibilityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xxl,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xxxl,
  },
  emptyText: {
    fontWeight: '600',
  },
});
