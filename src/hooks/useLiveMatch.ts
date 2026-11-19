import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useRemoteConfig } from '@/contexts/RemoteConfigContext';
import { applyScoreToMatch } from '@/lib/live';
import { subscribeLive } from '@/lib/liveChannels';
import { fetchLiveMatch, isLiveUnavailable } from '@/services/tournamentsLive';
import type { LiveMatchDetail } from '@/types';

/** One live (or just-finished) match for the live match screen — realtime with a polling fallback. */
export function useLiveMatch(matchId: string | undefined) {
  const killSwitchOn = useRemoteConfig<boolean>('live_realtime', true);
  const pollSeconds = useRemoteConfig<number>('live_poll_seconds', 10);
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const [match, setMatch] = useState<LiveMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [connected, setConnected] = useState(false);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const ref = useRef<LiveMatchDetail | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!matchId) return;
    try {
      const m = await fetchLiveMatch(matchId);
      ref.current = m;
      setMatch(m);
      setMissing(!m);
      if (m) setServerOffsetMs(Date.parse(m.server_now) - Date.now());
    } catch (e) {
      if (isLiveUnavailable(e)) setUnavailable(true);
      else setMissing(true);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  const scheduleRefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      void load();
    }, 500);
  }, [load]);

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

  const code = match?.live_code ?? null;
  const useSocket = focused && killSwitchOn && !!code && !unavailable;
  useEffect(() => {
    if (!useSocket || !code) return;
    const off = subscribeLive(code, {
      onScore: (ev) => {
        const cur = ref.current;
        if (!cur || ev.match_id !== cur.match_id) return;
        const r = applyScoreToMatch(cur, ev);
        const next = { ...cur, ...r.match } as LiveMatchDetail;
        if (r.match !== cur) {
          ref.current = next;
          setMatch(next);
        }
        if (r.refetch || ev.state === 'finished') scheduleRefetch();
      },
      onConfig: () => scheduleRefetch(),
      onStatus: (ok) => {
        setConnected(ok);
        if (ok) scheduleRefetch();
      },
    });
    return () => {
      off();
      setConnected(false);
    };
  }, [useSocket, code, scheduleRefetch]);

  const polling = focused && !unavailable && (!killSwitchOn || !connected);
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => void load(), Math.max(3, pollSeconds) * 1000);
    return () => clearInterval(id);
  }, [polling, pollSeconds, load]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { match, loading, missing, unavailable, connected, refresh: load, serverOffsetMs };
}
