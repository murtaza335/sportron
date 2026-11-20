import { Pressable, StyleSheet, View } from 'react-native';

import { LivePill } from '@/components/live/LivePill';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import { useTheme } from '@/hooks/use-theme';
import { useTicker } from '@/hooks/useTicker';
import { formatClock, isStale, viewerElapsed, type LiveMatch, type Side } from '@/lib/live';

/** Clock text for a live summary, corrected by the server-time offset (so a wrong phone clock doesn't matter). */
export function liveClockText(m: LiveMatch, serverOffsetMs: number, now: number): string | null {
  const c = m.summary?.clock;
  if (!c) return null;
  const updated = m.updated_at ? new Date(m.updated_at).getTime() : 0;
  const nowServer = now ? now + serverOffsetMs : updated; // before the first tick: show the pushed value as is
  return formatClock(viewerElapsed(c, nowServer, updated), c.dir, c.limit_ms);
}

export const matchHeading = (m: LiveMatch): string => [m.module_name, m.round_name ?? m.code].filter(Boolean).join(' · ');

function SideRow({ m, side }: { m: LiveMatch; side: Side }) {
  const theme = useTheme();
  const s = m.summary!;
  const entry = side === 'a' ? m.a : m.b;
  const big = side === 'a' ? s.a : s.b;
  const mid = side === 'a' ? s.a_mid : s.b_mid;
  const subs = side === 'a' ? s.a_sub : s.b_sub;
  const extra = entry?.fields?.map((f) => f.value).join(' · ');
  return (
    <View style={styles.side}>
      <View style={[styles.dot, { backgroundColor: SideColors[side].fg }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <ThemedText numberOfLines={1} style={{ fontWeight: '800', fontSize: 16, flexShrink: 1 }}>
            {entry?.name ?? (side === 'a' ? 'Side A' : 'Side B')}
          </ThemedText>
          {s.server === side && <View style={styles.serve} accessibilityLabel="Serving" />}
        </View>
        {extra ? (
          <ThemedText variant="caption" muted numberOfLines={1}>
            {extra}
          </ThemedText>
        ) : null}
      </View>
      {subs.length > 0 && (
        <View style={styles.subs}>
          {subs.slice(-6).map((x, i) => (
            <ThemedText key={i} muted style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {x}
            </ThemedText>
          ))}
        </View>
      )}
      {mid != null && (
        <ThemedText muted style={{ fontWeight: '700', minWidth: 18, textAlign: 'right' }}>
          {mid}
        </ThemedText>
      )}
      <ThemedText allowFontScaling={false} style={[styles.big, { color: theme.text }]} accessibilityLabel={`${entry?.name ?? ''} ${big}`}>
        {big}
      </ThemedText>
    </View>
  );
}

/** One live (or just-finished) match as a card: names, set chips, big current points, clock, context line. */
export function LiveMatchCard({ m, serverOffsetMs, onPress }: { m: LiveMatch; serverOffsetMs: number; onPress?: () => void }) {
  const theme = useTheme();
  const s = m.summary;
  const running = !!s?.clock?.running;
  const final = m.state === 'finished';
  // 4×/s only while a clock runs; otherwise every 5 s is enough to notice a silent scorer.
  const now = useTicker(!final, running ? 250 : 5000);
  if (!s) return null;
  const clock = liveClockText(m, serverOffsetMs, now);
  const stale = now > 0 && isStale(m, now + serverOffsetMs);
  const label = s.state_label === 'LIVE' ? undefined : s.state_label;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${m.a?.name ?? ''} versus ${m.b?.name ?? ''}, ${s.a} to ${s.b}. ${s.state_label}`}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={styles.head}>
        {final ? (
          <View style={[styles.final, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>FINAL</ThemedText>
          </View>
        ) : (
          <LivePill label={label} compact />
        )}
        <ThemedText variant="caption" muted numberOfLines={1} style={{ flex: 1 }}>
          {[matchHeading(m), m.court].filter(Boolean).join(' · ')}
        </ThemedText>
        {clock && !final ? <ThemedText style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>{clock}</ThemedText> : null}
      </View>
      <SideRow m={m} side="a" />
      <SideRow m={m} side="b" />
      {s.line ? (
        <ThemedText variant="caption" muted numberOfLines={1}>
          {s.line}
        </ThemedText>
      ) : null}
      {stale ? (
        <ThemedText variant="caption" style={{ color: theme.warning }}>
          Waiting for the scorer…
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.md, gap: Spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  final: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 3 },
  side: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serve: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FACC15' },
  subs: { flexDirection: 'row', gap: 8 },
  big: { fontSize: 34, lineHeight: 38, fontWeight: '900', minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
