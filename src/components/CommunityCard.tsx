import { Image, Pressable, StyleSheet, View } from 'react-native';
import { ShieldCheck, Users } from 'lucide-react-native';
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

const IMAGE_HEIGHT = 140;

export function CommunityCard({ community, membershipRole }: CommunityCardProps) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(`/community/${community.id}?communityName=${encodeURIComponent(community.name)}`)}
      style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
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
            <ThemedText variant="caption" muted numberOfLines={2} style={styles.desc}>
              {community.description}
            </ThemedText>
          )}
          <View style={styles.metaRow}>
            <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText variant="caption" muted style={styles.badgeText}>
                {SPORT_LABELS[community.sport]}
              </ThemedText>
            </View>
            <Users size={12} color={theme.textSecondary} strokeWidth={2} />
            <ThemedText variant="caption" muted>
              {community.member_count ?? 0}
            </ThemedText>
            <View style={[styles.badge, { backgroundColor: theme.backgroundSelected }]}>
              <ThemedText variant="caption" muted style={styles.badgeText}>
                {community.visibility === 'public' ? 'Public' : 'Private'}
              </ThemedText>
            </View>
            {membershipRole && (
              <View
                style={[
                  styles.badge,
                  styles.memberTag,
                  {
                    backgroundColor:
                      membershipRole === 'admin' ? '#F59E0B20' : '#3B82F620',
                  },
                ]}
              >
                <ShieldCheck
                  size={10}
                  color={membershipRole === 'admin' ? '#D97706' : '#2563EB'}
                  strokeWidth={2.5}
                />
                <ThemedText
                  variant="caption"
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    color: membershipRole === 'admin' ? '#D97706' : '#2563EB',
                  }}
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
    borderRadius: Radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  imageContainer: {
    height: IMAGE_HEIGHT,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: IMAGE_HEIGHT,
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
    fontWeight: '700',
  },
  desc: {
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  memberTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
