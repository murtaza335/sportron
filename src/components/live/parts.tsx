import { Minus, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { LiveSide, LiveStatus } from '@/constants/liveColors';
import { useLiveSync } from '@/hooks/useLiveSync';
import { useTheme } from '@/hooks/use-theme';
import { haptics } from '@/lib/haptics';
import type { Side } from '@/lib/live';

/** Taps on the same control closer than this are one tap (thumb bounce / double hit). */
const BOUNCE_MS = 150;

export function useBounceGuard() {
  const last = useRef(0);
  return (fn: () => void) => {
    const t = Date.now();
    if (t - last.current < BOUNCE_MS) return;
    last.current = t;
    fn();
  };
}

// ─── Sync pill ───────────────────────────────────────────────────────────────

export function SyncPill({ matchId, onPress }: { matchId: string; onPress?: () => void }) {
  const theme = useTheme();
  const st = useLiveSync(matchId);
  const phase = st?.phase ?? 'synced';
  const color =
    phase === 'synced' ? LiveStatus.synced : phase === 'syncing' ? LiveStatus.syncing : phase === 'offline' ? LiveStatus.offline : theme.error;
  const text =
    phase === 'synced'
      ? 'Synced'
      : phase === 'syncing'
        ? 'Syncing…'
        : phase === 'offline'
          ? 'Offline · saved'
          : phase === 'taken'
            ? 'Taken over'
            : phase === 'ended'
              ? 'Match ended'
              : 'Not syncing';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Live sync status: ${text}`}
      style={[styles.pill, { borderColor: color, backgroundColor: theme.backgroundElement }]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText variant="caption" style={{ color, fontWeight: '700' }}>
        {text}
      </ThemedText>
    </Pressable>
  );
}

// ─── Big tappable half ───────────────────────────────────────────────────────

export function ScoreHalf({
  side,
  name,
  big,
  midLabel,
  mid,
  subs,
  serving,
  hint,
  onAdd,
  onSub,
  disabled,
  accessibilityLabel,
}: {
  side: Side;
  name: string;
  big: string;
  midLabel?: string;
  mid?: string | null;
  subs: string[];
  serving: boolean;
  hint?: string;
  onAdd: () => void;
  onSub?: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const c = LiveSide[side];
  const reduced = useReducedMotion();
  const [box, setBox] = useState({ w: 0, h: 0 });
  const guard = useBounceGuard();
  const pulse = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!reduced) pulse.set(withSequence(withTiming(1.08, { duration: 70 }), withTiming(1, { duration: 140 })));
  }, [big, reduced, pulse]);

  const bigStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const fontSize = Math.max(48, Math.min(box.w * 0.62, box.h * 0.42, 220));

  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        guard(() => {
          haptics.light();
          onAdd();
        });
      }}
      onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.half, { backgroundColor: pressed ? c.pressed : c.fg, opacity: disabled ? 0.7 : 1 }]}
    >
      <View style={styles.halfTop}>
        <ThemedText numberOfLines={2} style={styles.halfName}>
          {name}
        </ThemedText>
        {serving && <View style={styles.serve} accessibilityLabel="Serving" />}
      </View>
      {mid != null && (
        <ThemedText style={styles.halfMid}>
          {midLabel ? `${midLabel} ${mid}` : mid}
        </ThemedText>
      )}
      {subs.length > 0 && (
        <View style={styles.subs}>
          {subs.map((s, i) => (
            <View key={i} style={styles.subChip}>
              <ThemedText style={styles.subText}>{s}</ThemedText>
            </View>
          ))}
        </View>
      )}
      <View style={styles.bigWrap}>
        <Animated.Text
          allowFontScaling={false}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={[styles.big, { fontSize, lineHeight: fontSize * 1.05 }, bigStyle]}
        >
          {big}
        </Animated.Text>
      </View>
      {hint ? <ThemedText style={styles.hint}>{hint}</ThemedText> : null}
      {onSub && (
        <Pressable
          onPress={() => {
            guard(() => {
              haptics.light();
              onSub();
            });
          }}
          disabled={disabled}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove a point from ${name}`}
          style={({ pressed }) => [styles.minus, { backgroundColor: pressed ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.28)' }]}
        >
          <Minus size={28} color="#fff" strokeWidth={3} />
        </Pressable>
      )}
    </Pressable>
  );
}

// ─── Buttons / bars / banners ────────────────────────────────────────────────

export function BarButton({
  label,
  icon,
  onPress,
  disabled,
  tone = 'default',
  style,
  accessibilityLabel,
}: {
  label: string;
  icon?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const guard = useBounceGuard();
  const bg = tone === 'primary' ? theme.accent : theme.backgroundElement;
  const fg = tone === 'primary' ? '#fff' : tone === 'danger' ? theme.error : theme.text;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => guard(onPress)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.barBtn,
        { backgroundColor: bg, borderColor: tone === 'primary' ? bg : theme.border, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {icon}
      <ThemedText numberOfLines={1} style={{ color: fg, fontWeight: '700', fontSize: 16, flexShrink: 1 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** A square-ish value button used for +1/+2/+3, keypads, counters. */
export function ValueButton({
  label,
  onPress,
  color,
  size = 72,
  disabled,
  accessibilityLabel,
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const guard = useBounceGuard();
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        guard(() => {
          haptics.light();
          onPress();
        });
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.value,
        {
          minHeight: size,
          minWidth: size,
          backgroundColor: color ?? theme.backgroundElement,
          borderColor: color ?? theme.border,
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <ThemedText style={{ color: color ? '#fff' : theme.text, fontWeight: '800', fontSize: small ? 18 : 26 }}>{label}</ThemedText>
    </Pressable>
  );
}

export function PlusIcon({ color = '#fff' }: { color?: string }) {
  return <Plus size={22} color={color} strokeWidth={3} />;
}

/** Inline, non-blocking message strip (game ended, change ends, …). */
export function Banner({
  text,
  tone = 'info',
  actionLabel,
  onAction,
}: {
  text: string;
  tone?: 'info' | 'warn' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  const bg = tone === 'error' ? 'rgba(239,68,68,0.14)' : tone === 'warn' ? 'rgba(245,158,11,0.16)' : theme.backgroundSelected;
  return (
    <View style={[styles.banner, { backgroundColor: bg, borderColor: theme.border }]}>
      <ThemedText style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
        {text}
      </ThemedText>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <ThemedText style={{ color: theme.accent, fontWeight: '800' }}>{actionLabel}</ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  half: { flex: 1, padding: Spacing.md, alignItems: 'center', justifyContent: 'flex-start' },
  halfTop: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', justifyContent: 'center' },
  halfName: { color: '#fff', fontSize: 20, lineHeight: 26, fontWeight: '800', textAlign: 'center', flexShrink: 1 },
  serve: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#FDE047', borderWidth: 2, borderColor: '#fff' },
  halfMid: { color: 'rgba(255,255,255,0.9)', fontSize: 16, fontWeight: '700', marginTop: 2 },
  subs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 6 },
  subChip: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: Radius.sm, paddingHorizontal: 10, paddingVertical: 3 },
  subText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  bigWrap: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  big: { color: '#fff', fontWeight: '900', textAlign: 'center', fontVariant: ['tabular-nums'] },
  hint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginBottom: 4 },
  minus: { width: 64, height: 56, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  barBtn: { minHeight: 56, paddingHorizontal: Spacing.md, borderRadius: Radius.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  value: { borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.md, paddingVertical: 10, borderRadius: Radius.md, borderWidth: 1 },
});
