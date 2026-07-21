import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  AlignLeft,
  ChevronRight,
  Globe,
  Info,
  Lock,
  Plus,
  Swords,
  Users,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { useCommunity } from '@/hooks/useCommunity';
import {
  joinCommunity,
  requestToJoinCommunity,
} from '@/services/communities';
import { SPORT_LABELS } from '@/types';

export default function CommunityInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { user } = useAuth();
  const {
    community,
    membership,
    loading,
    refresh,
    setMembership,
  } = useCommunity(id ?? '', user?.id);

  const isMember = !!membership;
  const isRestricted = community?.visibility === 'restricted';

  const handleJoin = async () => {
    if (!id || !user) return;
    try {
      if (isRestricted) {
        await requestToJoinCommunity(id, user.id);
        Alert.alert('Request Sent', 'The admin will review your request.');
      } else {
        await joinCommunity(id, user.id);
        setMembership({
          community_id: id,
          profile_id: user.id,
          role: 'member',
          approval_status: 'approved',
          matches_played: 0,
          wins: 0,
          losses: 0,
          win_ratio: 0,
          joined_at: new Date().toISOString(),
        });
      }
      refresh();
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to join.');
    }
  };

  if (loading) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Community Info' }} />
        <ActivityIndicator color={theme.text} style={styles.loader} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.safe, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: 'Community Info' }} />
        <ThemedText muted style={styles.loader}>Community not found</ThemedText>
      </View>
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: 'Community Details' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={theme.text}
          />
        }
      >
        {/* Main Details Card */}
        <Card style={styles.heroCard}>
          {/* Header Badges */}
          <View style={styles.tagsRow}>
            {/* Sport Badge */}
            <View style={[styles.badge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
              <Swords size={14} color={theme.text} strokeWidth={2} />
              <ThemedText variant="caption" style={styles.badgeText}>
                {SPORT_LABELS[community.sport] || community.sport}
              </ThemedText>
            </View>

            {/* Visibility Badge */}
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: community.visibility === 'public' ? '#10B9811A' : '#D977061A',
                  borderColor: community.visibility === 'public' ? '#10B98140' : '#D9770640',
                },
              ]}
            >
              {community.visibility === 'public' ? (
                <Globe size={14} color="#10B981" strokeWidth={2} />
              ) : (
                <Lock size={14} color="#D97706" strokeWidth={2} />
              )}
              <ThemedText
                variant="caption"
                style={[
                  styles.badgeText,
                  { color: community.visibility === 'public' ? '#10B981' : '#D97706' },
                ]}
              >
                {community.visibility === 'public' ? 'Public' : 'Restricted'}
              </ThemedText>
            </View>
          </View>

          {/* About Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <AlignLeft size={16} color={theme.textSecondary} strokeWidth={2} />
              <ThemedText variant="label" muted>About</ThemedText>
            </View>
            <ThemedText variant="body" style={styles.aboutText}>
              {community.description || 'No description provided for this community.'}
            </ThemedText>
          </View>

          {/* Visibility Hint */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Info size={16} color={theme.textSecondary} strokeWidth={2} />
              <ThemedText variant="label" muted>Access</ThemedText>
            </View>
            <ThemedText variant="caption" muted style={styles.hintText}>
              {community.visibility === 'public'
                ? 'Anyone can view content and join this community freely.'
                : 'Membership requires approval from a community administrator.'}
            </ThemedText>
          </View>
        </Card>

        {/* Combined Members Tile */}
        <Pressable
          onPress={() => router.navigate(`/community/${id}/members`)}
          style={[styles.membersCard, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <View style={styles.membersLeft}>
            <View style={[styles.iconContainer, { backgroundColor: theme.background }]}>
              <Users size={20} color={theme.text} strokeWidth={2} />
            </View>
            <View>
              <ThemedText variant="body" style={styles.memberTitle}>
                Members
              </ThemedText>
              <ThemedText variant="caption" muted>
                {community.member_count ?? 0} {community.member_count === 1 ? 'member' : 'members'} enrolled
              </ThemedText>
            </View>
          </View>
          <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>

        {/* CTA Section (Visible to non-members) */}
        {!isMember && (
          <Card style={styles.joinCard}>
            <Button
              label={isRestricted ? 'Request to Join' : 'Join Community'}
              icon={<Plus size={18} color={theme.background} strokeWidth={2.5} />}
              onPress={handleJoin}
              buttonStyle={styles.joinButton}
            />
            <ThemedText variant="caption" muted style={styles.joinHint}>
              {isRestricted
                ? 'Your request will be sent to the administrator for review.'
                : 'You will gain instant access upon joining.'}
            </ThemedText>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },

  // Hero Card Styles
  heroCard: {
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  badgeText: {
    fontWeight: '700',
    fontSize: 12,
  },
  sectionContainer: {
    gap: Spacing.xs,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  aboutText: {
    lineHeight: 22,
    marginTop: 2,
  },
  hintText: {
    lineHeight: 18,
  },

  // Members Card Styles
  membersCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  membersLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberTitle: {
    fontWeight: '700',
  },

  // Join Action Section
  joinCard: {
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.xs,
  },
  joinButton: {
    width: '100%',
  },
  joinHint: {
    textAlign: 'center',
  },
});