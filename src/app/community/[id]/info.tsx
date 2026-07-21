import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  Bell,
  ChevronRight,
  Globe,
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
      <Stack.Screen options={{ title: 'Community Info' }} />

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
        {/* Sport Section */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionIconRow}>
            <Swords size={18} color={theme.text} strokeWidth={2} />
            <ThemedText variant="label" muted>Sport</ThemedText>
          </View>
          <View style={[styles.badge, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText variant="body" style={{ fontWeight: '700' }}>
              {SPORT_LABELS[community.sport] || community.sport}
            </ThemedText>
          </View>
        </Card>

        {/* About Section */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionIconRow}>
            <Bell size={18} color={theme.text} strokeWidth={2} />
            <ThemedText variant="label" muted>About</ThemedText>
          </View>
          <ThemedText variant="body" style={styles.aboutText}>
            {community.description || 'No description provided.'}
          </ThemedText>
        </Card>

        {/* Visibility Section */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionIconRow}>
            {community.visibility === 'public' ? (
              <Globe size={18} color="#10B981" strokeWidth={2} />
            ) : (
              <Lock size={18} color="#D97706" strokeWidth={2} />
            )}
            <ThemedText variant="label" muted>Visibility</ThemedText>
          </View>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: community.visibility === 'public' ? '#10B98120' : '#D9770620',
                borderColor: community.visibility === 'public' ? '#10B98140' : '#D9770640',
              },
            ]}
          >
            <View
              style={[
                styles.visibilityDot,
                { backgroundColor: community.visibility === 'public' ? '#10B981' : '#D97706' },
              ]}
            />
            <ThemedText
              variant="body"
              style={{
                fontWeight: '700',
                color: community.visibility === 'public' ? '#10B981' : '#D97706',
              }}
            >
              {community.visibility === 'public' ? 'Public' : 'Restricted'}
            </ThemedText>
          </View>
          <ThemedText variant="caption" muted style={styles.hintText}>
            {community.visibility === 'public'
              ? 'Anyone can join this community.'
              : 'New members require admin approval to join.'}
          </ThemedText>
        </Card>

        {/* Members Section */}
        <Card style={styles.sectionCard}>
          <View style={styles.sectionIconRow}>
            <Users size={18} color={theme.text} strokeWidth={2} />
            <ThemedText variant="label" muted>Members</ThemedText>
          </View>
          <ThemedText variant="heading" style={styles.memberCount}>
            {community.member_count ?? 0}
          </ThemedText>
          <ThemedText variant="caption" muted>
            {community.member_count === 1 ? 'member' : 'members'}
          </ThemedText>
        </Card>

        <Pressable
          onPress={() => router.navigate(`/community/${id}/members`)}
          style={[styles.navLink, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}
        >
          <View style={styles.navLinkLeft}>
            <Users size={18} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText variant="body" style={{ fontWeight: '600' }}>
              View All Members
            </ThemedText>
          </View>
          <ChevronRight size={18} color={theme.textSecondary} strokeWidth={2} />
        </Pressable>

        {/* Join Button - only shown to non-members */}
        {!isMember && (
          <View style={styles.joinSection}>
            <Button
              label={isRestricted ? 'Request to Join' : 'Join Community'}
              icon={<Plus size={20} color={theme.background} strokeWidth={2.5} />}
              onPress={handleJoin}
              buttonStyle={styles.joinButton}
            />
            <ThemedText variant="caption" muted style={styles.joinHint}>
              {isRestricted
                ? 'Your request will be sent to the admin for approval.'
                : 'You\'ll get instant access to this community.'}
            </ThemedText>
          </View>
        )}

        {/* Back to community link */}
        <Pressable
          onPress={() => router.back()}
          style={styles.backLink}
        >
          <ThemedText variant="body" style={{ color: theme.textSecondary, fontWeight: '600', textAlign: 'center' }}>
            Back to Community
          </ThemedText>
        </Pressable>
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
  sectionCard: {
    gap: Spacing.sm,
  },
  sectionIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  visibilityDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  aboutText: {
    lineHeight: 22,
  },
  hintText: {
    marginTop: Spacing.xs,
  },
  memberCount: {
    fontSize: 36,
    lineHeight: 44,
  },
  joinSection: {
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  joinButton: {
    paddingVertical: Spacing.md,
  },
  joinHint: {
    textAlign: 'center',
  },
  backLink: {
    paddingVertical: Spacing.lg,
  },
  navLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  navLinkLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
});
