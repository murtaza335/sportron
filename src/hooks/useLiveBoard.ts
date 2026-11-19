import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRemoteConfig } from '@/contexts/RemoteConfigContext';
import { applyScoreEvent } from '@/lib/live';
import { subscribeLive } from '@/lib/liveChannels';
import { clearLiveMatchIds, setLiveMatchIds } from '@/lib/liveStatusStore';
import { fetchLiveBoard, fetchLiveTournaments, isLiveUnavailable } from '@/services/tournamentsLive';
import type { LiveBoard, LiveTournamentChip } from '@/types';

/** Tracks whether the screen is focused (sockets and timers only run while it is). */
function useIsFocused(): boolean {
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}

/**
 * Live board of a tournament.
 * - `realtime: false` (tournament screen): glanceable, polls every `pollMs` while focused — no socket.
 * - `realtime: true` (Live screen): joins the tournament's private channel; falls back to polling while the socket is
 *   down, or always when remote config `live_realtime` is false (the kill switch for the Free plan quota).
 */
export function useLiveBoard(tournamentId: string | undefined, opts: { realtime: boolean; pollMs?: number }) {
  const killSwitchOn = useRemoteConfig<boolean>('live_realtime', true);
  const pollSeconds = useRemoteConfig<number>('live_poll_seconds', 10);
  const focused = useIsFocused();
  const [board, setBoard] = useState<LiveBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const boardRef = useRef<LiveBoard | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const b = await fetchLiveBoard(tournamentId);
      boardRef.current = b;
      setBoard(b);
      setServerOffsetMs(Date.parse(b.server_now) - Date.now());
      setLiveMatchIds(tournamentId, b.live.map((m) => m.match_id));
      setUnavailable(false);
    } catch (e) {
      if (isLiveUnavailable(e)) setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  const scheduleRefetch = useCallback(() => {
    if (refetchTimer.current) return;
    refetchTimer.current = setTimeout(() => {
      refetchTimer.current = null;
      void load();
    }, 500);
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // first load + every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!focused) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load();
    });
    return () => sub.remove();
  }, [focused, load]);

  // realtime
  const code = board?.tournament?.live_code ?? null;
  const useSocket = opts.realtime && killSwitchOn && focused && !!code && !unavailable;
  useEffect(() => {
    if (!useSocket || !code) return;
    const off = subscribeLive(code, {
      onScore: (ev) => {
        const cur = boardRef.current;
        if (!cur) return;
        const r = applyScoreEvent(cur, ev);
        if (r.board !== cur) {
          boardRef.current = r.board;
          setBoard(r.board);
        }
        if (r.refetch) scheduleRefetch();
      },
      onConfig: () => scheduleRefetch(),
      onStatus: (ok) => {
        setConnected(ok);
        if (ok) scheduleRefetch(); // catch up on anything missed while connecting
      },
    });
    return () => {
      off();
      setConnected(false);
    };
  }, [useSocket, code, scheduleRefetch]);

  // polling: always for glanceable views, only while the socket is down for the Live screen
  const polling = focused && !unavailable && (!opts.realtime || !killSwitchOn || !connected);
  const pollMs = opts.realtime ? Math.max(3, pollSeconds) * 1000 : (opts.pollMs ?? 20_000);
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => void load(), pollMs);
    return () => clearInterval(id);
  }, [polling, pollMs, load]);

  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    },
    [],
  );

  // let rows / bracket nodes elsewhere show a LIVE pill, and forget it when this screen goes away
  useEffect(() => {
    if (!tournamentId) return;
    return () => clearLiveMatchIds(tournamentId);
  }, [tournamentId]);

  return { board, loading, unavailable, refreshing, refresh, connected, serverOffsetMs };
}

/** "Live now" chips for the Tournaments tab: tournaments (that the viewer can see) with matches in play. */
export function useLiveTournaments(): { chips: LiveTournamentChip[]; unavailable: boolean } {
  const [chips, setChips] = useState<LiveTournamentChip[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    try {
      setChips(await fetchLiveTournaments());
      setUnavailable(false);
    } catch (e) {
      setChips([]);
      if (isLiveUnavailable(e)) setUnavailable(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (unavailable) return;
      void load();
      const id = setInterval(() => void load(), 60_000);
      return () => clearInterval(id);
    }, [unavailable, load]),
  );

  return { chips, unavailable };
}
