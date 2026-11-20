import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Share2 } from 'lucide-react-native';
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LivePill } from '@/components/live/LivePill';
import { liveClockText, matchHeading } from '@/components/live/LiveMatchCard';
import { Button } from '@/components/ui/Button';
import { ThemedText } from '@/components/ui/Text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { SideColors } from '@/constants/liveColors';
import { useAuth } from '@/contexts/AuthContext';
import { useLiveMatch } from '@/hooks/useLiveMatch';
import { useTheme } from '@/hooks/use-theme';
import { useTicker } from '@/hooks/useTicker';
import { isStale, periodName, type LiveSnapshot, type Side, type TimedRules } from '@/lib/live';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import type { LiveMatchDetail } from '@/types';

const WEB_ORIGIN = 'https://sportron.app';

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const theme = useTheme();
  return (
    <View style={[styles.table, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      {[head, ...rows].map((r, i) => (
        <View key={i} style={[styles.tr, i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          {r.map((c, j) => (
            <ThemedText
              key={j}
              numberOfLines={1}
              variant={i === 0 ? 'caption' : 'body'}
              muted={i === 0}
              style={[j === 0 ? { flex: 1.4, fontWeight: i === 0 ? '600' : '700' } : { flex: 1, textAlign: 'center', fontVariant: ['tabular-nums'], fontWeight: i === 0 ? '600' : '800' }]}
            >
              {c}
            </ThemedText>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Per-sport detail under the big score: set scores, quarter table, innings, shootout. */
function Details({ m, snap }: { m: LiveMatchDetail; snap: LiveSnapshot }) {
  const a = m.a?.name ?? 'A';
  const b = m.b?.name ?? 'B';
  if (snap.family === 'sets') {
    const rows = snap.games.map((g, i) => [`Game ${i + 1}`, String(g.a), String(g.b)]);
    if (snap.state !== 'decided') rows.push([`Game ${snap.gameIndex + (snap.state === 'break' ? 2 : 1)} (now)`, String(snap.cur.a), String(snap.cur.b)]);
    return <Table head={['', a, b]} rows={rows} />;
  }
  if (snap.family === 'tennis') {
    const rows = snap.sets.map((s, i) => [`Set ${i + 1}${s.tb ? ` (${s.tb.a}–${s.tb.b})` : ''}`, String(s.a), String(s.b)]);
    if (snap.state !== 'decided') rows.push([`Set ${snap.setIndex + (snap.state === 'break' ? 2 : 1)} (now)`, String(snap.games.a), String(snap.games.b)]);
    return <Table head={['', a, b]} rows={rows} />;
  }
  if (snap.family === 'timed') {
    const rules = m.rules as TimedRules;
    const rows = snap.byPeriod.map((p, i) => [periodName(rules, i + 1), String(p.a), String(p.b)]);
    const out = [<Table key="t" head={['', a, b]} rows={rows} />];
    if (snap.shootout) {
      const mark = (list: boolean[]) => list.map((k) => (k ? '✓' : '✗')).join(' ') || '—';
      out.push(<Table key="s" head={['Shootout', a, b]} rows={[['Kicks', mark(snap.shootout.kicks.a), mark(snap.shootout.kicks.b)]]} />);
    }
    const c = snap.counters;
    if (c.a.fouls + c.b.fouls + c.a.timeouts + c.b.timeouts + c.a.yellow + c.b.yellow + c.a.red + c.b.red > 0) {
      out.push(
        <Table
          key="c"
          head={['', a, b]}
          rows={[
            ...(c.a.fouls + c.b.fouls > 0 ? [['Team fouls', String(c.a.fouls), String(c.b.fouls)]] : []),
            ...(c.a.timeouts + c.b.timeouts > 0 ? [['Timeouts', String(c.a.timeouts), String(c.b.timeouts)]] : []),
            ...(c.a.yellow + c.b.yellow > 0 ? [['Yellow cards', String(c.a.yellow), String(c.b.yellow)]] : []),
            ...(c.a.red + c.b.red > 0 ? [['Red cards', String(c.a.red), String(c.b.red)]] : []),
          ]}
        />,
      );
    }
    return <>{out}</>;
  }
  if (snap.family === 'cricket') {
    const name = (s: Side) => (s === 'a' ? a : b);
    return (
      <Table
        head={['Innings', 'Score', 'Overs']}
        rows={snap.innings.map((i, n) => [
          `${n + 1}. ${name(i.batting)}`,
          `${i.runs}/${i.wickets}`,
          `${Math.floor(i.balls / ((m.rules as { ballsPerOver?: number }).ballsPerOver ?? 6))}.${i.balls % ((m.rules as { ballsPerOver?: number }).ballsPerOver ?? 6)}`,
        ])}
      />
    );
  }
  return null;
}

export default function LiveMatchScreen() {
  const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { match: m, loading, missing, unavailable, serverOffsetMs } = useLiveMatch(matchId);
  const running = !!m?.summary?.clock?.running;
  const now = useTicker(!!m && m.state !== 'finished', running ? 250 : 5000);

  if (loading) return <ActivityIndicator color={theme.accent} style={{ marginTop: Spacing.xxl }} />;
  if (unavailable || missing || !m || !m.summary || !m.snapshot) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Live match' }} />
        <ThemedText variant="heading" style={{ textAlign: 'center' }}>
          {unavailable ? 'Live scores aren’t available yet' : 'This match isn’t live'}
        </ThemedText>
        <ThemedText muted style={{ textAlign: 'center' }}>
          It may not have started yet, or the referee isn’t scoring it live.
        </ThemedText>
        <Button label="Back to the tournament" variant="secondary" onPress={() => router.replace(tournamentRoutes.tournament(id))} />
      </View>
    );
  }

  const s = m.summary;
  const final = m.state === 'finished';
  const clock = liveClockText(m, serverOffsetMs, now);
  const stale = now > 0 && isStale(m, now + serverOffsetMs);
  const url = `${WEB_ORIGIN}/tournament/${id}/live/${matchId}`;
  const winner = final ? (Number(s.a) > Number(s.b) ? 'a' : Number(s.b) > Number(s.a) ? 'b' : null) : null;
  const side = (k: Side) => {
    const e = k === 'a' ? m.a : m.b;
    const big = k === 'a' ? s.a : s.b;
    const mid = k === 'a' ? s.a_mid : s.b_mid;
    return (
      <View style={[styles.sideCard, { backgroundColor: SideColors[k].soft, borderColor: winner === k ? SideColors[k].fg : theme.border, borderWidth: winner === k ? 2 : 1 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText numberOfLines={2} style={{ fontWeight: '800', fontSize: 20, color: SideColors[k].fg }}>
            {e?.name ?? (k === 'a' ? 'Side A' : 'Side B')}
            {s.server === k ? '  ●' : ''}
          </ThemedText>
          {e?.fields?.length ? (
            <ThemedText variant="caption" muted numberOfLines={1}>
              {e.fields.map((f) => f.value).join(' · ')}
            </ThemedText>
          ) : null}
          {mid != null ? (
            <ThemedText muted style={{ fontWeight: '700' }}>
              {mid}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText allowFontScaling={false} style={styles.bigScore}>
          {big}
        </ThemedText>
      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={[styles.content, { paddingBottom: Spacing.xl + insets.bottom }]}>
      <Stack.Screen options={{ title: 'Live match' }} />
      <View style={styles.head}>
        {final ? (
          <View style={[styles.final, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText style={{ fontWeight: '800', fontSize: 12 }}>FINAL</ThemedText>
          </View>
        ) : (
          <LivePill label={s.state_label === 'LIVE' ? undefined : s.state_label} />
        )}
        <ThemedText muted numberOfLines={1} style={{ flex: 1 }}>
          {[matchHeading(m), m.court, m.venue].filter(Boolean).join(' · ')}
        </ThemedText>
        {clock && !final ? <ThemedText style={{ fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'] }}>{clock}</ThemedText> : null}
      </View>

      {side('a')}
      {side('b')}

      {s.line ? <ThemedText style={{ fontWeight: '700', textAlign: 'center' }}>{s.line}</ThemedText> : null}
      {stale ? (
        <ThemedText style={{ color: theme.warning, textAlign: 'center' }}>Waiting for the scorer…</ThemedText>
      ) : null}

      <Details m={m} snap={m.snapshot} />

      <View style={{ gap: Spacing.sm }}>
        {final && <Button label="View in the bracket" onPress={() => router.push(tournamentRoutes.module(id, m.module_id))} />}
        {!final && m.scorer_id && m.scorer_id === user?.id && (
          <Button label="Resume scoring" onPress={() => router.push(tournamentRoutes.score(id, m.module_id, m.match_id))} />
        )}
        <Button
          label="Share this match"
          variant="secondary"
          icon={<Share2 size={18} color={theme.text} />}
          onPress={() => {
            const message = `${m.a?.name ?? ''} vs ${m.b?.name ?? ''} — follow live on Sportron`;
            Share.share(Platform.OS === 'ios' ? { message, url } : { message: `${message}\n${url}` }).catch(() => {});
          }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.lg },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.md, gap: Spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  final: { borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  sideCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.md, borderRadius: Radius.md },
  bigScore: { fontSize: 64, lineHeight: 70, fontWeight: '900', fontVariant: ['tabular-nums'] },
  table: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: 10, gap: Spacing.sm },
});
