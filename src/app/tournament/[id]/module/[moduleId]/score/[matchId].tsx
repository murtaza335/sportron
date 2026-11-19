import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { EllipsisVertical, Lock, Redo2, Undo2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CricketPanel } from '@/components/live/CricketPanel';
import { FinishSheet } from '@/components/live/FinishSheet';
import { RallyPanel } from '@/components/live/RallyPanel';
import { SimplePanel } from '@/components/live/SimplePanel';
import { StartSheet, type StartChoice } from '@/components/live/StartSheet';
import { TimedPanel } from '@/components/live/TimedPanel';
import { Banner, BarButton, SyncPill } from '@/components/live/parts';
import { SheetScrollView } from '@/components/motion/Sheet';
import { toast } from '@/components/motion/Toast';
import { BottomSheet } from '@/components/tournaments/BottomSheet';
import { ThemedText } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useFlag } from '@/contexts/RemoteConfigContext';
import { useLiveScorer } from '@/hooks/useLiveScorer';
import { useLiveSync } from '@/hooks/useLiveSync';
import { useTheme } from '@/hooks/use-theme';
import { alert } from '@/lib/alert';
import { haptics } from '@/lib/haptics';
import {
  describeRules,
  initSnapshot,
  newTimeline,
  resolveRules,
  summarize,
  toResult,
  type LiveRules,
  type Names,
  type Side,
  type Timeline,
} from '@/lib/live';
import { getLiveDeviceId, liveOutbox, startLiveOutbox } from '@/lib/liveOutbox';
import { friendlyTournamentError } from '@/lib/tournamentErrors';
import { bestOfLabel, matchTitle } from '@/lib/tournamentFormat';
import { tournamentRoutes } from '@/lib/tournamentRoutes';
import { fetchModuleDetail, fetchModuleMatches } from '@/services/tournaments';
import { abandonLive, fetchLiveMatch, startLive } from '@/services/tournamentsLive';
import type { LiveMatchDetail, ModuleDetail, TournamentMatch } from '@/types';

// ─── Loading the match + module once (no realtime: nothing here changes while scoring) ──────────────────────────

function useScoreContext(moduleId: string | undefined, matchId: string | undefined) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; detail: ModuleDetail | null; matches: TournamentMatch[] }>({
    loading: true,
    error: null,
    detail: null,
    matches: [],
  });
  useEffect(() => {
    if (!moduleId) return;
    let alive = true;
    (async () => {
      try {
        const [detail, matches] = await Promise.all([fetchModuleDetail(moduleId), fetchModuleMatches(moduleId)]);
        if (alive) setState({ loading: false, error: null, detail, matches });
      } catch (e) {
        if (alive) setState({ loading: false, error: friendlyTournamentError(e), detail: null, matches: [] });
      }
    })();
    return () => {
      alive = false;
    };
  }, [moduleId, matchId]);
  const match = state.matches.find((m) => m.id === matchId) ?? null;
  const courts = useMemo(() => Array.from(new Set(state.matches.map((m) => m.court).filter((c): c is string => !!c))), [state.matches]);
  return { ...state, match, courts };
}

type Boot =
  | { phase: 'loading' }
  | { phase: 'blocked'; reason: string }
  | { phase: 'start' }
  | { phase: 'takeover'; row: LiveMatchDetail }
  | { phase: 'running'; rules: LiveRules; timeline: Timeline };

// ─── Screen ──────────────────────────────────────────────────────────────────────────────────────────────────

export default function ScoreScreen() {
  const { id, moduleId, matchId } = useLocalSearchParams<{ id: string; moduleId: string; matchId: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const enabled = useFlag('live_scoring', false);
  const ctx = useScoreContext(moduleId, matchId);
  const [boot, setBoot] = useState<Boot>({ phase: 'loading' });
  const [busy, setBusy] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const mod = ctx.detail?.module ?? null;
  const match = ctx.match;
  const isAdmin = ctx.detail?.my_role === 'module_admin' || ctx.detail?.my_role === 'tournament_admin';

  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace(tournamentRoutes.module(id, moduleId));
  }, [router, id, moduleId]);

  const resolve = useCallback(
    (preset: string | null, bestOf: number | null): LiveRules =>
      resolveRules({
        sport: mod?.sport ?? 'other',
        sportKey: mod?.sport_key,
        liveRules: preset ? { preset } : (mod?.live_rules ?? null),
        matchBestOf: bestOf ?? match?.best_of ?? null,
        drawAllowed: !!match?.can_draw,
      }),
    [mod, match],
  );

  const names: Names = { a: match?.entry_a?.name ?? 'Side A', b: match?.entry_b?.name ?? 'Side B' };

  const openSlot = useCallback(
    async (rules: LiveRules, row: { seq: number; snapshot: Timeline['present']; summary: ReturnType<typeof summarize> }) => {
      const opened = await liveOutbox.open({
        matchId,
        meta: { tournamentId: id, moduleId, label: `${names.a} vs ${names.b}` },
        rules,
        server: { seq: row.seq, snapshot: row.snapshot, summary: row.summary },
        freshTimeline: newTimeline,
      });
      setBoot({ phase: 'running', rules, timeline: opened.timeline });
    },
    [matchId, id, moduleId, names.a, names.b],
  );

  const resumeFrom = async (row: LiveMatchDetail, takeover: boolean) => {
    setBusy(true);
    try {
      const rules = row.rules;
      const snapshot = row.snapshot!;
      const summary = row.summary!;
      const started = await startLive({ matchId, deviceId: await getLiveDeviceId(), takeover, rules, snapshot, summary });
      await openSlot(started.rules, { seq: started.seq, snapshot: started.snapshot, summary: started.summary });
    } catch (e) {
      setBoot({ phase: 'blocked', reason: friendlyTournamentError(e) });
    } finally {
      setBusy(false);
    }
  };

  // Decide what to show: blocked / resume from this phone / resume or take over from the server / fresh start.
  const decided = useRef(false);
  useEffect(() => {
    if (ctx.loading || decided.current) return;
    decided.current = true;
    (async () => {
      if (ctx.error || !mod || !match) return setBoot({ phase: 'blocked', reason: ctx.error ?? 'We couldn’t find that match.' });
      if (!enabled) {
        decided.current = false; // the flag may still be loading — decide again when it arrives
        return setBoot({ phase: 'blocked', reason: 'Live scoring isn’t available yet.' });
      }
      startLiveOutbox();
      if (!isAdmin) return setBoot({ phase: 'blocked', reason: 'Only tournament or module admins can score matches.' });
      // 1. unsent work from this phone (works offline, e.g. after the app was killed)
      const local = await liveOutbox.peek(matchId);
      if (local) return setBoot({ phase: 'running', rules: local.rules, timeline: local.timeline });
      if (match.status === 'completed' || match.status === 'walkover' || match.status === 'bye' || match.status === 'cancelled') {
        return setBoot({ phase: 'blocked', reason: 'This match is already finished.' });
      }
      if (mod.status !== 'in_progress') return setBoot({ phase: 'blocked', reason: 'The module has to be in progress to score matches.' });
      if (!match.entry_a || !match.entry_b) return setBoot({ phase: 'blocked', reason: 'Both sides must be set before the match can start.' });
      // 2. a live row on the server?
      let row: LiveMatchDetail | null = null;
      try {
        row = await fetchLiveMatch(matchId);
      } catch {
        row = null;
      }
      if (row && (row.state === 'live' || row.state === 'break')) {
        const recent = row.updated_at ? Date.now() - new Date(row.updated_at).getTime() < 2 * 60_000 : false;
        if (row.scorer_id && row.scorer_id !== user?.id && recent) return setBoot({ phase: 'takeover', row });
        return void resumeFrom(row, false);
      }
      if (row && row.state === 'finished') return setBoot({ phase: 'blocked', reason: 'This match is already finished.' });
      setBoot({ phase: 'start' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.loading, ctx.error, mod, match, enabled, isAdmin]);

  const start = async (c: StartChoice) => {
    setBusy(true);
    setStartError(null);
    try {
      const at = Date.now();
      const snapshot = initSnapshot(c.rules, { firstServer: c.firstServer, firstBat: c.firstBat, at });
      const summary = summarize(snapshot, c.rules, { names, at });
      const row = await startLive({ matchId, deviceId: await getLiveDeviceId(), court: c.court, rules: c.rules, snapshot, summary });
      await openSlot(row.rules, { seq: row.seq, snapshot: row.snapshot, summary: row.summary });
      haptics.success();
    } catch (e) {
      haptics.error();
      setStartError(friendlyTournamentError(e));
    } finally {
      setBusy(false);
    }
  };

  if (boot.phase === 'running' && match && mod) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Scoring
          key={matchId}
          tournamentId={id}
          moduleId={moduleId}
          matchId={matchId}
          match={match}
          rules={boot.rules}
          names={names}
          initial={boot.timeline}
          onLeave={goBack}
        />
      </>
    );
  }

  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {boot.phase === 'loading' || busy ? (
        <ActivityIndicator color={theme.accent} size="large" />
      ) : boot.phase === 'blocked' ? (
        <View style={styles.blocked}>
          <ThemedText variant="heading" style={{ textAlign: 'center' }}>
            {boot.reason}
          </ThemedText>
          <BarButton label="Back" onPress={goBack} />
        </View>
      ) : boot.phase === 'takeover' ? (
        <View style={styles.blocked}>
          <ThemedText variant="heading" style={{ textAlign: 'center' }}>
            Another admin is scoring this match
          </ThemedText>
          <ThemedText muted style={{ textAlign: 'center' }}>
            If you take over, they stop scoring and you continue from the current score.
          </ThemedText>
          <BarButton label="Take over scoring" tone="primary" onPress={() => void resumeFrom(boot.row, true)} />
          <BarButton label="Back" onPress={goBack} />
        </View>
      ) : null}

      {boot.phase === 'start' && mod && match && (
        <StartSheet
          visible
          match={match}
          module={mod}
          courts={ctx.courts}
          resolve={resolve}
          busy={busy}
          error={startError}
          onStart={start}
          onClose={goBack}
        />
      )}
    </View>
  );
}

// ─── Scoring (mounted once the match is live) ────────────────────────────────────────────────────────────────

function Scoring({
  tournamentId,
  moduleId,
  matchId,
  match,
  rules,
  names,
  initial,
  onLeave,
}: {
  tournamentId: string;
  moduleId: string;
  matchId: string;
  match: TournamentMatch;
  rules: LiveRules;
  names: Names;
  initial: Timeline;
  onLeave: () => void;
}) {
  useKeepAwake();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scorer = useLiveScorer(matchId, rules, names, initial);
  const sync = useLiveSync(matchId);
  const { snap, summary, act } = scorer;
  const [swapped, setSwapped] = useState(false);
  const [locked, setLocked] = useState(false);
  const [menu, setMenu] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const readOnly = sync?.phase === 'taken' || sync?.phase === 'ended' || sync?.phase === 'error' || !!sync?.finished;
  const decided = snap.state === 'decided';
  const landscape = width > height;

  const leave = useCallback(() => {
    alert('Leave scoring?', 'The match stays live and keeps syncing from this phone.', [
      { text: 'Keep scoring', style: 'cancel' },
      { text: 'Leave', onPress: onLeave },
    ]);
  }, [onLeave]);

  // Android back = the same prompt, never a silent exit mid-match
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (finishOpen || menu) return false;
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave, finishOpen, menu]);

  // Finished on the server → celebrate and go back to the module
  const wentBack = useRef(false);
  useEffect(() => {
    if (!sync?.finished || wentBack.current) return;
    wentBack.current = true;
    haptics.success();
    toast('Result saved', 'The bracket has been updated.');
    void liveOutbox.discard(matchId);
    onLeave();
  }, [sync?.finished, matchId, onLeave]);

  // Keyboard shortcuts (web / tablets with a keyboard): A / L = point (Shift = −1), Z undo, Y redo, Space clock
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (locked || readOnly || finishOpen || menu) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      const side: Side | null = k === 'a' ? 'a' : k === 'l' ? 'b' : null;
      if (side && (rules.family === 'sets' || rules.family === 'tennis')) {
        act(e.shiftKey && rules.family === 'sets' ? { t: 'unpoint', side } : { t: 'point', side });
      } else if (side && (rules.family === 'timed' || rules.family === 'simple')) {
        const v = rules.buttons[0] ?? 1;
        act({ t: 'score', side, value: e.shiftKey ? -v : v, at: Date.now() });
      } else if (k === 'z') scorer.undo();
      else if (k === 'y') scorer.redo();
      else if (k === ' ' && (rules.family === 'timed' || rules.family === 'simple') && (snap.family === 'timed' || snap.family === 'simple')) {
        e.preventDefault();
        act(snap.clock.running ? { t: 'clockStop', at: Date.now() } : { t: 'clockStart', at: Date.now() });
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, scorer, rules, snap, locked, readOnly, finishOpen, menu]);

  const result = useMemo(
    () => toResult(snap, rules, { names, drawAllowed: match.can_draw }),
    [snap, rules, names, match.can_draw],
  );

  const save = (winner: Side | null, note: string | null) => {
    const level = result.scoreA === result.scoreB && !result.draw;
    const winnerId = level ? (winner === 'a' ? match.entry_a?.id : winner === 'b' ? match.entry_b?.id : null) ?? null : null;
    liveOutbox.queueFinish(matchId, scorer.timeline, summarize(snap, rules, { names, at: Date.now() }), {
      scoreA: result.scoreA,
      scoreB: result.scoreB,
      scoreDetail: result.detail,
      winnerEntryId: winnerId,
      note: note ?? result.note,
    });
    haptics.medium();
  };

  const abandon = () => {
    setMenu(false);
    alert('Stop live scoring?', 'The match returns to “not started”. You can record the result normally or start again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Stop scoring',
        style: 'destructive',
        onPress: async () => {
          try {
            await abandonLive(matchId);
            await liveOutbox.discard(matchId);
            onLeave();
          } catch (e) {
            toast('Couldn’t stop scoring', friendlyTournamentError(e), 'error');
          }
        },
      },
    ]);
  };

  const panelProps = { scorer, names, swapped, disabled: readOnly || locked };

  return (
    <View style={[styles.flex, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
      {/* top bar */}
      <View style={[styles.top, { borderBottomColor: theme.border }]}>
        <Pressable onPress={leave} hitSlop={10} accessibilityRole="button" accessibilityLabel="Leave scoring" style={styles.iconBtn}>
          <X size={26} color={theme.text} />
        </Pressable>
        <View style={styles.flex}>
          <ThemedText numberOfLines={1} style={{ fontWeight: '800', fontSize: 16 }}>
            {matchTitle(match)}
            {match.court ? ` · ${match.court}` : ''}
          </ThemedText>
          <ThemedText variant="caption" muted numberOfLines={1}>
            {bestOfLabel(match.best_of)} · {summary.state_label}
          </ThemedText>
        </View>
        <SyncPill matchId={matchId} onPress={() => toast(sync?.lastSentAt ? `Last sent ${Math.max(0, Math.round((Date.now() - sync.lastSentAt) / 1000))} s ago` : 'Not sent yet', sync?.message ?? 'Scores are saved on this phone first, then sent in the background.')} />
        <Pressable onPress={() => setMenu(true)} hitSlop={10} accessibilityRole="button" accessibilityLabel="More options" style={styles.iconBtn}>
          <EllipsisVertical size={26} color={theme.text} />
        </Pressable>
      </View>

      {sync?.phase === 'taken' && <Banner tone="error" text="Another admin took over scoring. This screen is read-only now." actionLabel="Leave" onAction={onLeave} />}
      {sync?.phase === 'ended' && !sync.finished && <Banner tone="warn" text="This match was ended elsewhere." actionLabel="Leave" onAction={onLeave} />}
      {sync?.phase === 'error' && <Banner tone="error" text={sync.message ?? 'Live scoring stopped.'} actionLabel="Leave" onAction={onLeave} />}

      {/* panel */}
      <View style={styles.flex}>
        {(rules.family === 'sets' || rules.family === 'tennis') && <RallyPanel {...panelProps} rules={rules} />}
        {rules.family === 'timed' && <TimedPanel {...panelProps} rules={rules} />}
        {rules.family === 'cricket' && <CricketPanel scorer={scorer} rules={rules} names={names} disabled={readOnly || locked} />}
        {rules.family === 'simple' && <SimplePanel {...panelProps} rules={rules} />}

        {locked && (
          <Pressable
            onLongPress={() => {
              haptics.medium();
              setLocked(false);
            }}
            delayLongPress={1000}
            accessibilityRole="button"
            accessibilityLabel="Screen locked. Hold to unlock"
            style={styles.lock}
          >
            <Lock size={40} color="#fff" />
            <ThemedText style={{ color: '#fff', fontWeight: '800', fontSize: 20 }}>Locked</ThemedText>
            <ThemedText style={{ color: '#fff' }}>Hold for 1 second to unlock</ThemedText>
          </Pressable>
        )}
      </View>

      {/* bottom bar */}
      <View style={[styles.bottom, { borderTopColor: theme.border }]}>
        {scorer.lastLabel ? (
          <ThemedText variant="caption" muted numberOfLines={1} style={{ paddingHorizontal: Spacing.md }}>
            Last: {scorer.lastLabel} · {summary.a}–{summary.b}
          </ThemedText>
        ) : null}
        <View style={styles.bottomRow}>
          <BarButton
            label={scorer.undoLabel ?? 'Undo'}
            icon={<Undo2 size={22} color={theme.text} />}
            disabled={!scorer.canUndo || readOnly || locked}
            onPress={() => {
              haptics.medium();
              scorer.undo();
            }}
            style={styles.flex}
            accessibilityLabel={scorer.undoLabel ?? 'Undo'}
          />
          {scorer.canRedo && (
            <BarButton
              label={landscape ? scorer.redoLabel ?? 'Redo' : 'Redo'}
              icon={<Redo2 size={22} color={theme.text} />}
              disabled={readOnly || locked}
              onPress={scorer.redo}
              accessibilityLabel={scorer.redoLabel ?? 'Redo'}
            />
          )}
          <BarButton
            label={decided ? `Finish · ${result.winner ? names[result.winner] : 'draw'}` : 'Finish'}
            tone={decided ? 'primary' : 'default'}
            disabled={readOnly || locked}
            onPress={() => setFinishOpen(true)}
            style={styles.flex}
          />
        </View>
      </View>

      <FinishSheet visible={finishOpen} names={names} result={result} status={sync} onSave={save} onClose={() => setFinishOpen(false)} />

      <BottomSheet visible={menu} onClose={() => setMenu(false)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}>
          <ThemedText variant="heading">Options</ThemedText>
          <ThemedText variant="caption" muted>
            {describeRules(rules)}
          </ThemedText>
          <BarButton label="Swap ends" onPress={() => { setSwapped((v) => !v); setMenu(false); }} />
          <BarButton label="Lock screen" icon={<Lock size={20} color={theme.text} />} onPress={() => { setLocked(true); setMenu(false); }} />
          <BarButton label="Help & shortcuts" onPress={() => { setMenu(false); setHelp(true); }} />
          <BarButton label="Stop live scoring" tone="danger" onPress={abandon} />
        </SheetScrollView>
      </BottomSheet>

      <BottomSheet visible={help} onClose={() => setHelp(false)}>
        <SheetScrollView contentContainerStyle={{ gap: Spacing.sm, paddingBottom: Spacing.lg }}>
          <ThemedText variant="heading">How scoring works</ThemedText>
          <ThemedText>• Tap a side to add a point. Use − under a side to correct a slip.</ThemedText>
          <ThemedText>• Undo is always bottom-left and says what it undoes. Redo appears right after.</ThemedText>
          <ThemedText>• Games, sets and periods end by themselves — Undo reopens them.</ThemedText>
          <ThemedText>• Lock the screen between games; hold 1 second to unlock.</ThemedText>
          <ThemedText>• No signal? Keep scoring: everything is saved on this phone and sent when you’re back online.</ThemedText>
          {Platform.OS === 'web' && <ThemedText>• Keyboard: A / L point (Shift = −1), Z undo, Y redo, Space start/stop the clock.</ThemedText>}
        </SheetScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  blocked: { gap: Spacing.md, padding: Spacing.lg, alignItems: 'stretch', maxWidth: 420, width: '100%' },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottom: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.xs, paddingBottom: Spacing.sm, gap: Spacing.xs },
  bottomRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.sm },
  lock: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,17,21,0.92)', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, borderRadius: Radius.md },
});
