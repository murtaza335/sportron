import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut } from 'react-native-reanimated';

import { Skeleton, SkeletonCircle, SkeletonProvider } from '@/components/motion/Skeleton';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Duration, RM } from '@/lib/motion';

function Box({ children, style }: { children: React.ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function CommunityCardSkeleton() {
  return (
    <Box style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ aspectRatio: 16 / 9 }}>
        <Skeleton height={undefined} radius={0} style={{ flex: 1 }} />
      </View>
      <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
        <Skeleton width="55%" height={16} />
        <Skeleton width="90%" height={11} />
        <Skeleton width="35%" height={11} />
        <View style={styles.row}>
          <Skeleton width={64} height={20} radius={Radius.full} />
          <Skeleton width={36} height={14} />
          <Skeleton width={52} height={20} radius={Radius.full} />
        </View>
      </View>
    </Box>
  );
}

export function SessionCardSkeleton() {
  return (
    <Box style={{ gap: Spacing.sm }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Skeleton width="50%" height={16} />
        <Skeleton width={56} height={20} radius={Radius.full} />
      </View>
      <Skeleton width={80} height={20} radius={Radius.full} />
      <Skeleton width="45%" height={11} />
      <Skeleton width="40%" height={11} />
      <View style={[styles.row, { justifyContent: 'space-between', marginTop: Spacing.xs }]}>
        <Skeleton width={70} height={14} />
        <Skeleton width={90} height={11} />
      </View>
    </Box>
  );
}

export function ChatRowSkeleton() {
  return (
    <View style={[styles.row, { paddingVertical: Spacing.md, paddingHorizontal: Spacing.md, gap: Spacing.md }]}>
      <SkeletonCircle size={48} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="45%" height={14} />
        <Skeleton width="75%" height={11} />
      </View>
      <Skeleton width={30} height={10} />
    </View>
  );
}

export function FeedItemSkeleton() {
  return (
    <Box style={{ gap: Spacing.md }}>
      <View style={[styles.row, { gap: Spacing.sm }]}>
        <SkeletonCircle size={36} />
        <View style={{ gap: 6, flex: 1 }}>
          <Skeleton width="35%" height={12} />
          <Skeleton width="20%" height={10} />
        </View>
      </View>
      <Skeleton height={12} />
      <Skeleton width="70%" height={12} />
      <View style={[styles.row, { gap: Spacing.lg }]}>
        <Skeleton width={40} height={14} />
        <Skeleton width={40} height={14} />
      </View>
    </Box>
  );
}

export function TournamentCardSkeleton() {
  return (
    <Box style={{ padding: 0, overflow: 'hidden' }}>
      <Skeleton height={110} radius={0} />
      <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Skeleton width="55%" height={16} />
          <Skeleton width={56} height={20} radius={Radius.full} />
        </View>
        <Skeleton width="40%" height={11} />
        <Skeleton width="60%" height={11} />
      </View>
    </Box>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <View style={{ alignItems: 'center', gap: Spacing.md, padding: Spacing.lg }}>
      <SkeletonCircle size={96} />
      <Skeleton width={140} height={18} />
      <Skeleton width={200} height={12} />
      <View style={[styles.row, { gap: Spacing.lg }]}>
        <Skeleton width={70} height={40} radius={Radius.md} />
        <Skeleton width={70} height={40} radius={Radius.md} />
        <Skeleton width={70} height={40} radius={Radius.md} />
      </View>
    </View>
  );
}

export function NotificationRowSkeleton() {
  return (
    <Box style={[styles.row, { gap: Spacing.md }]}>
      <SkeletonCircle size={40} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="60%" height={13} />
        <Skeleton width="90%" height={11} />
      </View>
    </Box>
  );
}

/** A stack of skeleton rows sharing one pulse loop; fades out when removed. */
export function SkeletonList({
  count = 4,
  Item,
  gap = Spacing.md,
  style,
}: {
  count?: number;
  Item: React.ComponentType;
  gap?: number;
  style?: object;
}) {
  return (
    <SkeletonProvider>
      <Animated.View exiting={FadeOut.duration(Duration.fast).reduceMotion(RM)} style={[{ gap }, style]}>
        {Array.from({ length: count }).map((_, i) => (
          <Item key={i} />
        ))}
      </Animated.View>
    </SkeletonProvider>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
});
