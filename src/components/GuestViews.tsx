import { Building2, Lock, MessageSquare, Trophy, Users, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CommunityCard } from '@/components/CommunityCard';
import { SignInCard } from '@/components/SignInSheet';
import { FadeImage } from '@/components/motion/FadeImage';
import { PressableScale } from '@/components/motion/PressableScale';
import { ThemedRefreshControl } from '@/components/motion/ThemedRefreshControl';
import { CommunityCardSkeleton, SkeletonList } from '@/components/skeletons';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { requireAuth } from '@/lib/requireAuth';
import type { SignInReason } from '@/lib/signInReasons';
import { fetchCommunityById, fetchDiscoverCommunities } from '@/services/communities';
import type { Community } from '@/types';
import { communitySportLabel } from '@/types';

/** A tab that has nothing to show without an account (Chats, Activity): explain it and ask once, inline. */
export function GuestTab({ reason }: { reason: SignInReason }) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.tabContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.maxWidth}>
        <SignInCard reason={reason} />
      </View>
    </ScrollView>
  );
}

let bannerDismissed = false;

/** A calm one-line nudge. Dismissible ones stay gone for the rest of the visit (never persisted, never naggy). */
export function GuestBanner({
  title,
  body,
  reason,
  dismissible,
}: {
  title: string;
  body: string;
  reason: SignInReason;
  dismissible?: boolean;
}) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(dismissible ? bannerDismissed : false);
  if (hidden) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.bannerText}>
        <ThemedText variant="label" style={{ fontWeight: '700' }}>
          {title}
        </ThemedText>
        <ThemedText variant="caption" muted>
          {body}
        </ThemedText>
      </View>
      <PressableScale
        scaleTo={0.95}
        onPress={() => requireAuth(reason)}
        style={[styles.bannerButton, { backgroundColor: theme.text }]}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        <ThemedText variant="caption" style={{ color: theme.background, fontWeight: '700' }}>
          Sign in
        </ThemedText>
      </PressableScale>
      {dismissible ? (
        <Pressable
          onPress={() => {
            bannerDismissed = true;
            setHidden(true);
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <X size={16} color={theme.textSecondary} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Communities tab for a guest: nobody has "my communities" yet, so show the ones worth joining. */
export function GuestCommunitiesList() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchDiscoverCommunities()
      .then((list) => alive && setCommunities(list))
      .catch((e) => console.error('Failed to load communities:', e))
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={[styles.listContent, { paddingBottom: Spacing.lg + Math.max(insets.bottom, 56) }]}
      refreshControl={
        <ThemedRefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            setReloadKey((k) => k + 1);
          }}
        />
      }
    >
      <GuestBanner
        title="Already in a community?"
        body="Sign in to see yours, chat and record matches."
        reason="join_community"
      />
      <ThemedText variant="heading" style={styles.listTitle}>
        Communities to join
      </ThemedText>
      {loading ? (
        <SkeletonList Item={CommunityCardSkeleton} count={3} />
      ) : (
        <View style={styles.grid}>
          {communities.map((c) => (
            <CommunityCard key={c.id} community={c} membershipRole={null} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const LOCKED: { icon: typeof Users; label: string }[] = [
  { icon: Users, label: 'Posts and photos from members' },
  { icon: Trophy, label: 'Match results and the leaderboard' },
  { icon: MessageSquare, label: 'The community group chat' },
];

/**
 * Community page for a guest: the CARD (what the server allows a stranger to see) plus a clear list of what
 * joining unlocks. No member content is shown or fetched (migration 134). Once they sign in this screen is
 * swapped for the full community page automatically.
 */
export function GuestCommunityView({ id }: { id: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [community, setCommunity] = useState<Community | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchCommunityById(id)
      .then((c) => alive && setCommunity(c))
      .catch((e) => console.error('Failed to load community:', e))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <SkeletonList Item={CommunityCardSkeleton} count={1} />
      </View>
    );
  }

  if (!community) {
    return (
      <View style={[styles.fill, styles.center, { backgroundColor: theme.background }]}>
        <ThemedText variant="body" muted style={{ textAlign: 'center' }}>
          This community could not be found.
        </ThemedText>
      </View>
    );
  }

  const restricted = community.visibility === 'restricted';
  const count = community.member_count ?? 0;

  return (
    <View style={[styles.fill, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.detailContent, { paddingBottom: 120 + insets.bottom }]}>
        <View style={styles.maxWidth}>
          {community.image_url ? (
            <FadeImage
              source={{ uri: community.image_url }}
              style={[styles.cover, { backgroundColor: theme.border }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.cover, styles.center, { backgroundColor: theme.border }]}>
              <ThemedText variant="title" style={{ color: theme.textSecondary, opacity: 0.5 }}>
                {community.name.charAt(0).toUpperCase()}
              </ThemedText>
            </View>
          )}

          <ThemedText variant="title" style={styles.name}>
            {community.name}
          </ThemedText>

          <View style={styles.metaRow}>
            <View style={[styles.pill, { backgroundColor: `${theme.accent}1F` }]}>
              <ThemedText variant="caption" style={{ color: theme.accent, fontWeight: '700' }}>
                {communitySportLabel(community)}
              </ThemedText>
            </View>
            <View style={styles.inline}>
              <Users size={13} color={theme.textSecondary} strokeWidth={2} />
              <ThemedText variant="caption" muted>
                {count} {count === 1 ? 'member' : 'members'}
              </ThemedText>
            </View>
            {community.organization ? (
              <View style={styles.inline}>
                <Building2 size={13} color={theme.textSecondary} strokeWidth={2} />
                <ThemedText variant="caption" muted numberOfLines={1}>
                  {community.organization}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {community.description ? (
            <ThemedText variant="body" style={styles.desc}>
              {community.description}
            </ThemedText>
          ) : null}

          <ThemedText variant="caption" muted style={styles.by}>
            Created by {community.creator?.username ?? 'a member'}
            {community.location ? ` · ${community.location}` : ''}
          </ThemedText>

          <View style={[styles.locked, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText variant="label" style={{ fontWeight: '700', marginBottom: Spacing.sm }}>
              Inside this community
            </ThemedText>
            {LOCKED.map(({ icon: Icon, label }) => (
              <View key={label} style={styles.lockedRow}>
                <Icon size={16} color={theme.textSecondary} strokeWidth={2} />
                <ThemedText variant="body" muted style={{ flex: 1 }}>
                  {label}
                </ThemedText>
                <Lock size={14} color={theme.textSecondary} strokeWidth={2} />
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View
        style={[
          styles.cta,
          { backgroundColor: theme.background, borderTopColor: theme.border, paddingBottom: Spacing.md + insets.bottom },
        ]}
      >
        <View style={styles.maxWidth}>
          <Button
            label={restricted ? 'Request to join' : 'Join community'}
            haptic="light"
            onPress={() => requireAuth('join_community', { name: community.name, count })}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  maxWidth: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  tabContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: Spacing.lg },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  bannerText: { flex: 1, gap: 2 },
  bannerButton: { paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: Radius.full },
  listContent: { padding: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  listTitle: { marginBottom: Spacing.sm },
  grid: { gap: Spacing.md },
  detailContent: { padding: Spacing.md },
  cover: { width: '100%', aspectRatio: 16 / 9, borderRadius: Radius.lg, overflow: 'hidden' },
  name: { marginTop: Spacing.md },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.full },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  desc: { marginTop: Spacing.md },
  by: { marginTop: Spacing.sm },
  locked: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cta: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: Spacing.md, paddingHorizontal: Spacing.md, borderTopWidth: 1 },
});
