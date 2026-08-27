import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Building2, ShieldCheck, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Community, CommunityMemberRole } from '@/types';
import { SPORT_LABELS } from '@/types';

type CommunityCardProps = {
  community: Community;
  membershipRole?: CommunityMemberRole | null;
};

const CARD_IMAGE_ASPECT_RATIO = 16 / 9;

export function CommunityCard({ community, membershipRole }: CommunityCardProps) {
  const theme = useTheme();
  const router = useRouter();
  const isDark = theme.resolvedColorScheme === 'dark';

  return (
    <Pressable
      onPress={() => router.push(`/community/${community.id}?communityName=${encodeURIComponent(community.name)}`)}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={styles.imageContainer}>
          {community.image_url ? (
            <Image
              source={{ uri: community.image_url }}
              style={[styles.image, { backgroundColor: theme.border }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.image, styles.placeholder, { backgroundColor: theme.border }]}>
              <ThemedText variant="title" style={{ color: theme.textSecondary, opacity: 0.5 }}>
                {community.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.info}>
          <ThemedText variant="body" style={styles.name} numberOfLines={1}>
            {community.name}
          </ThemedText>
          {community.description && (
            <ThemedText
              variant="caption"
              numberOfLines={2}
              style={[styles.desc, { color: theme.textSecondary }]}
            >
              {community.description}
            </ThemedText>
          )}
          <View style={styles.byRow}>
            <ThemedText
              variant="caption"
              numberOfLines={1}
              style={[styles.byText, { color: theme.textSecondary }]}
            >
              Created by {community.creator?.username ?? 'unknown'}
            </ThemedText>
            {community.organization && (
              <View style={styles.orgItem}>
                <Building2 size={11} color={theme.textSecondary} strokeWidth={2} />
                <ThemedText
                  variant="caption"
                  numberOfLines={1}
                  style={[styles.byText, { color: theme.textSecondary }]}
                >
                  {community.organization}
                </ThemedText>
              </View>
            )}
          </View>
          <View style={styles.metaRow}>
            {/* Sport pill — capsule, semi-transparent accent */}
            <View
              style={[
                styles.sportPill,
                {
                  backgroundColor: isDark
                    ? 'rgba(0, 168, 181, 0.15)'
                    : 'rgba(0, 168, 181, 0.1)',
                },
              ]}
            >
              <ThemedText
                variant="caption"
                style={[
                  styles.sportPillText,
                  { color: isDark ? '#2DD4BF' : '#00A8B5' },
                ]}
              >
                {SPORT_LABELS[community.sport]}
              </ThemedText>
            </View>

            {/* Member count */}
            <View style={styles.memberCount}>
              <Users size={12} color={theme.textSecondary} strokeWidth={2} />
              <ThemedText
                variant="caption"
                style={[styles.metaText, { color: theme.textSecondary }]}
              >
                {community.member_count ?? 0}
              </ThemedText>
            </View>

            {/* Visibility pill — capsule */}
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: isDark ? '#262A34' : '#E2E8F0',
                },
              ]}
            >
              <ThemedText
                variant="caption"
                style={[
                  styles.statusPillText,
                  { color: theme.textSecondary },
                ]}
              >
                {community.visibility === 'public' ? 'Public' : 'Private'}
              </ThemedText>
            </View>

            {/* Member/Admin badge */}
            {membershipRole && (
              <View
                style={[
                  styles.memberTag,
                  {
                    backgroundColor: isDark
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'rgba(16, 185, 129, 0.1)',
                  },
                ]}
              >
                <ShieldCheck
                  size={10}
                  color={isDark ? '#34D399' : '#10B981'}
                  strokeWidth={2.5}
                />
                <ThemedText
                  variant="caption"
                  style={[
                    styles.memberTagText,
                    { color: isDark ? '#34D399' : '#10B981' },
                  ]}
                >
                  {membershipRole === 'admin' ? 'Admin' : 'Member'}
                </ThemedText>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageContainer: {
    aspectRatio: CARD_IMAGE_ASPECT_RATIO,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    padding: Spacing.md,
    gap: 2,
  },
  name: {
    fontWeight: '600',
  },
  desc: {
    marginTop: 1,
    fontWeight: '400',
  },
  byRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  byText: {
    fontSize: 11,
    fontWeight: '500',
  },
  orgItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: '100%',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    flexWrap: 'wrap',
  },
  sportPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  sportPillText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  memberCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  memberTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  memberTagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
